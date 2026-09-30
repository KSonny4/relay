"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Rating } from "@/components/rating";
import { nextAttempt } from "@/lib/attempt-number";
import { startLiveSession, type LiveSession } from "@/lib/deepgram-live";
import {
  classifyLive,
  classifySession,
  fetchDeepgramAccessToken,
  listSessions,
} from "@/lib/relay-api";
import {
  createClassifyPlan,
  nextWordsAt,
  onClassifyTick,
  onTranscriptEvent,
  takeEnds,
  type ClassifyPlan,
} from "@/lib/take-rules";
import { applyTranscriptPiece, combineTranscript } from "@/lib/transcript";

type Phase = "recording" | "classifying" | "idle";

export function LiveTake() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("recording");
  const [finals, setFinals] = useState("");
  const [interim, setInterim] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishRef = useRef<() => void>(() => {});

  const finalsRef = useRef("");
  const interimRef = useRef("");
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const timerRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const classifyPlanRef = useRef<ClassifyPlan>(createClassifyPlan());
  const classifyGenRef = useRef(0);
  const takeIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastWordsAtRef = useRef(0);
  const recordingRef = useRef(false);

  useEffect(() => {
    const aborted = { current: false };
    finalsRef.current = "";
    interimRef.current = "";
    chunksRef.current = [];
    classifyPlanRef.current = createClassifyPlan();
    finishingRef.current = false;
    const takeId = ++takeIdRef.current;

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    function releaseMedia() {
      clearTimer();
      recordingRef.current = false;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      liveRef.current?.close();
      liveRef.current = null;
    }

    function publishLiveScore(transcript: string) {
      const generation = ++classifyGenRef.current;
      void classifyLive(transcript)
        .then((live) => {
          if (aborted.current || takeId !== takeIdRef.current || generation !== classifyGenRef.current) {
            return;
          }
          setScore(live.score);
        })
        .catch((caught: unknown) => {
          if (aborted.current || takeId !== takeIdRef.current || generation !== classifyGenRef.current) {
            return;
          }
          setError(caught instanceof Error ? caught.message : "Live score update failed.");
        });
    }

    function rememberTranscript(text: string, isFinal: boolean) {
      if (!recordingRef.current || aborted.current) return;
      const previous = combineTranscript(finalsRef.current, interimRef.current);
      const next = applyTranscriptPiece(finalsRef.current, text, isFinal);
      finalsRef.current = next.finals;
      interimRef.current = next.interim;
      setFinals(next.finals);
      setInterim(next.interim);
      const updated = combineTranscript(next.finals, next.interim);
      const now = performance.now();
      lastWordsAtRef.current = nextWordsAt(previous, updated, lastWordsAtRef.current, now);
      const step = onTranscriptEvent(classifyPlanRef.current, {
        atMs: now,
        fullTranscript: updated,
        isFinal,
      });
      classifyPlanRef.current = step.plan;
      if (step.send) publishLiveScore(step.send);
    }

    async function finish() {
      if (finishingRef.current || aborted.current) return;
      finishingRef.current = true;
      recordingRef.current = false;
      clearTimer();
      takeIdRef.current += 1;
      classifyPlanRef.current = createClassifyPlan();
      setPhase("classifying");

      const recorder = recorderRef.current;
      const stream = streamRef.current;
      const live = liveRef.current;
      recorderRef.current = null;
      streamRef.current = null;
      liveRef.current = null;

      let audioBlob: Blob | null = null;
      try {
        audioBlob = await stopRecorder(recorder, chunksRef.current);
      } catch {
        audioBlob = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      live?.close();
      if (aborted.current) return;

      const transcript = combineTranscript(finalsRef.current, interimRef.current);
      try {
        const saved = await listSessions();
        if (aborted.current) return;
        const classification = await classifySession({
          attempt: nextAttempt(saved.map((session) => session.attempt)),
          transcript,
          ...(audioBlob && audioBlob.size > 0
            ? {
                audioBase64: await blobToBase64(audioBlob),
                ...(audioBlob.type ? { mimeType: audioBlob.type } : {}),
              }
            : {}),
        });
        if (aborted.current) return;
        router.replace(`/sessions/${classification.id}`);
      } catch (caught) {
        if (aborted.current) return;
        setError(caught instanceof Error ? caught.message : "Classification failed.");
        setPhase("idle");
        finishingRef.current = false;
      }
    }

    finishRef.current = () => {
      void finish();
    };

    function watch() {
      clearTimer();
      timerRef.current = window.setInterval(() => {
        if (!recordingRef.current || aborted.current) return;
        const now = performance.now();
        if (
          takeEnds({
            elapsedMs: now - startedAtRef.current,
            msSinceLastWords: now - lastWordsAtRef.current,
            userStopped: false,
          })
        ) {
          void finish();
          return;
        }
        const step = onClassifyTick(classifyPlanRef.current, now);
        classifyPlanRef.current = step.plan;
        if (step.send) publishLiveScore(step.send);
      }, 100);
    }

    async function begin() {
      let stream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("No microphone. Paste a transcript instead.");
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (aborted.current || takeId !== takeIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const accessToken = await fetchDeepgramAccessToken();
        if (aborted.current || takeId !== takeIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const live = await startLiveSession(accessToken, rememberTranscript, (liveError) => {
          if (!aborted.current) setError(liveError.message);
        });
        if (aborted.current || takeId !== takeIdRef.current) {
          live.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        liveRef.current = live;
        const mimeType = preferredMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size === 0) return;
          chunksRef.current.push(event.data);
          live.sendAudio(event.data);
        });
        recorderRef.current = recorder;
        const now = performance.now();
        startedAtRef.current = now;
        lastWordsAtRef.current = now;
        recordingRef.current = true;
        recorder.start(250);
        setPhase("recording");
        watch();
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop());
        if (aborted.current) return;
        releaseMedia();
        setError(caught instanceof Error ? caught.message : "Could not start recording.");
        setPhase("idle");
      }
    }

    void begin();

    return () => {
      aborted.current = true;
      finishRef.current = () => {};
      if (!finishingRef.current) releaseMedia();
    };
  }, [router]);

  const transcript = combineTranscript(finals, interim);

  return (
    <div className="flex min-h-dvh flex-col bg-white text-black md:grid md:h-dvh md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:overflow-hidden">
      <section className="flex flex-col gap-10 border-b border-black/10 px-[clamp(1.25rem,4vw,4rem)] py-[clamp(1.5rem,4vw,4rem)] md:justify-between md:border-r md:border-b-0">
        <Rating score={score} pending={score === null} />
        <div>
          {error ? (
            <p role="alert" className="mb-6 text-sm">
              {error}
            </p>
          ) : null}
          {phase === "idle" ? (
            <Link href="/" className="text-sm text-neutral-500">
              Recordings
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => finishRef.current()}
              disabled={phase === "classifying"}
              className="h-12 rounded-full bg-black px-8 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "classifying" ? "Saving" : "Stop"}
            </button>
          )}
        </div>
      </section>
      <section className="min-h-0 flex-1 overflow-y-auto px-[clamp(1.25rem,4vw,4rem)] py-[clamp(1.5rem,4vw,4rem)]">
        <div aria-live="polite" className="text-[clamp(1.5rem,2.6vw,2.25rem)] leading-snug break-words">
          {transcript ? (
            transcript
          ) : (
            <span className="text-neutral-500">
              {phase === "recording" ? "Waiting for speech." : "The words show up here."}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopRecorder(recorder: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
  if (!recorder || recorder.state === "inactive") {
    return Promise.resolve(blobFromChunks(chunks, recorder?.mimeType));
  }
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve(blobFromChunks(chunks, recorder.mimeType)), {
      once: true,
    });
    recorder.stop();
  });
}

function blobFromChunks(chunks: Blob[], mimeType: string | undefined): Blob | null {
  if (chunks.length === 0) return null;
  return new Blob(chunks, { type: mimeType || chunks[0].type || "" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read the recording."));
        return;
      }
      const comma = reader.result.indexOf(",");
      resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}
