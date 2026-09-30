"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RecordingPage } from "@/components/recording-page";
import { nextAttempt } from "@/lib/attempt-number";
import {
  classifyLive,
  classifySession,
  listSessions,
  transcribeAudio,
} from "@/lib/relay-api";
import { emptyCriteria, type Criteria } from "@/lib/score-display";
import {
  createClassifyPlan,
  nextWordsAt,
  onClassifyTick,
  onTranscriptEvent,
  takeEnds,
  type ClassifyPlan,
} from "@/lib/take-rules";
import { isPresentMode, shouldStartPresentedTake } from "@/lib/present-mode";
import { emptyScript, type TranscriptScript } from "@/lib/transcript-script";

type Phase = "recording" | "classifying";

export function LiveTake() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("recording");
  const [script, setScript] = useState<TranscriptScript>(emptyScript);
  const [criteria, setCriteria] = useState<Criteria>(emptyCriteria);
  const [error, setError] = useState<string | null>(null);
  const finishRef = useRef<() => void>(() => {});

  const finalsRef = useRef("");
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
    chunksRef.current = [];
    classifyPlanRef.current = createClassifyPlan();
    finishingRef.current = false;
    const takeId = ++takeIdRef.current;
    let transcribeChain: Promise<void> = Promise.resolve();

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
    }

    function stillThisTake(): boolean {
      return !aborted.current && takeId === takeIdRef.current;
    }

    function publishLiveScore(transcript: string) {
      const generation = ++classifyGenRef.current;
      void classifyLive(transcript)
        .then((live) => {
          if (!stillThisTake() || generation !== classifyGenRef.current) return;
          setCriteria(live);
        })
        .catch((caught: unknown) => {
          if (!stillThisTake() || generation !== classifyGenRef.current) return;
          setError(caught instanceof Error ? caught.message : "Live score update failed.");
        });
    }

    function rememberScript(next: TranscriptScript) {
      if (!stillThisTake()) return;
      const previous = finalsRef.current;
      finalsRef.current = next.transcript;
      setScript(next);
      const now = performance.now();
      lastWordsAtRef.current = nextWordsAt(previous, next.transcript, lastWordsAtRef.current, now);
      const step = onTranscriptEvent(classifyPlanRef.current, {
        atMs: now,
        fullTranscript: next.transcript,
        isFinal: true,
      });
      classifyPlanRef.current = step.plan;
      if (step.send) publishLiveScore(step.send);
    }

    function currentAudio(): { blob: Blob; mimeType: string } | null {
      const chunks = chunksRef.current;
      if (chunks.length === 0) return null;
      const mimeType = recorderRef.current?.mimeType || chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) return null;
      return { blob, mimeType };
    }

    async function transcribeCurrent() {
      const audio = currentAudio();
      if (!audio || !stillThisTake()) return;
      const next = await transcribeAudio(await blobToBase64(audio.blob), audio.mimeType);
      if (!stillThisTake()) return;
      rememberScript(next);
    }

    function queueTranscribe() {
      transcribeChain = transcribeChain
        .then(() => transcribeCurrent())
        .catch((caught: unknown) => {
          if (!stillThisTake()) return;
          setError(caught instanceof Error ? caught.message : "Transcription failed.");
        });
      return transcribeChain;
    }

    async function finish() {
      if (finishingRef.current || aborted.current) return;
      finishingRef.current = true;
      recordingRef.current = false;
      clearTimer();
      setPhase("classifying");

      const recorder = recorderRef.current;
      const stream = streamRef.current;
      recorderRef.current = null;
      streamRef.current = null;

      let audioBlob: Blob | null = null;
      try {
        audioBlob = await stopRecorder(recorder, chunksRef.current);
      } catch {
        audioBlob = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      takeIdRef.current += 1;
      classifyPlanRef.current = createClassifyPlan();

      let transcript = finalsRef.current;
      if (audioBlob && audioBlob.size > 0) {
        try {
          const next = await transcribeAudio(
            await blobToBase64(audioBlob),
            audioBlob.type || "audio/webm",
          );
          transcript = next.transcript;
          finalsRef.current = next.transcript;
          setScript(next);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Transcription failed.");
        }
      }

      try {
        const saved = await listSessions();
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
        router.replace(`/sessions/${classification.id}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Classification failed.");
        setPhase("recording");
        finishingRef.current = false;
        takeIdRef.current = takeId;
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
        if (!stillThisTake()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = preferredMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size === 0) return;
          chunksRef.current.push(event.data);
          if (recordingRef.current && stillThisTake()) queueTranscribe();
        });
        recorderRef.current = recorder;
        const now = performance.now();
        startedAtRef.current = now;
        lastWordsAtRef.current = now;
        recordingRef.current = true;
        recorder.start(2000);
        watch();
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!stillThisTake()) return;
        setError(caught instanceof Error ? caught.message : "Could not start recording.");
      }
    }

    let starting = false;

    function startTake() {
      if (starting || recordingRef.current || finishingRef.current) return;
      starting = true;
      void begin().finally(() => {
        starting = false;
      });
    }

    const present = isPresentMode(window.location.search);
    function onReelMessage(event: MessageEvent) {
      if (
        !shouldStartPresentedTake({
          origin: event.origin,
          data: event.data,
          takeRunning: starting || recordingRef.current || finishingRef.current,
        })
      ) {
        return;
      }
      startTake();
    }

    if (present) {
      window.addEventListener("message", onReelMessage);
    } else {
      startTake();
    }

    return () => {
      aborted.current = true;
      if (present) window.removeEventListener("message", onReelMessage);
      finishRef.current = () => {};
      if (!finishingRef.current) releaseMedia();
    };
  }, [router]);

  return (
    <RecordingPage
      criteria={criteria}
      recommendation={null}
      showFix={false}
      script={script}
      error={error}
      waiting={phase === "recording" ? "Waiting for speech." : "The words show up here."}
      stop={{
        label: phase === "classifying" ? "Saving" : "Stop",
        onClick: () => finishRef.current(),
      }}
    />
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
