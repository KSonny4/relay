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
import { isPresentMode } from "@/lib/present-mode";
import { consumePresentedStart, retainPresentedStart, setPresentedHandler } from "@/lib/present-queue";
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
  const startedAtRef = useRef(0);
  const lastWordsAtRef = useRef(0);
  const recordingRef = useRef(false);

  useEffect(() => {
    const aborted = { current: false };
    finalsRef.current = "";
    chunksRef.current = [];
    classifyPlanRef.current = createClassifyPlan();
    finishingRef.current = false;
    let takeGeneration = 0;
    let transcribeChain: Promise<void> = Promise.resolve();

    function isLive(gen: number): boolean {
      return !aborted.current && gen === takeGeneration;
    }

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

    function publishLiveScore(gen: number, transcript: string) {
      const scoreGeneration = ++classifyGenRef.current;
      void classifyLive(transcript)
        .then((live) => {
          if (!isLive(gen) || scoreGeneration !== classifyGenRef.current) return;
          setCriteria(live);
        })
        .catch((caught: unknown) => {
          if (!isLive(gen) || scoreGeneration !== classifyGenRef.current) return;
          setError(caught instanceof Error ? caught.message : "Live score update failed.");
        });
    }

    function rememberScript(gen: number, next: TranscriptScript) {
      if (!isLive(gen)) return;
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
      if (step.send) publishLiveScore(gen, step.send);
    }

    function currentAudio(): { blob: Blob; mimeType: string } | null {
      const chunks = chunksRef.current;
      if (chunks.length === 0) return null;
      const mimeType = recorderRef.current?.mimeType || chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) return null;
      return { blob, mimeType };
    }

    async function transcribeCurrent(gen: number) {
      const audio = currentAudio();
      if (!audio || !isLive(gen)) return;
      const next = await transcribeAudio(await blobToBase64(audio.blob), audio.mimeType);
      if (!isLive(gen)) return;
      rememberScript(gen, next);
    }

    function queueTranscribe(gen: number) {
      transcribeChain = transcribeChain
        .then(() => transcribeCurrent(gen))
        .catch((caught: unknown) => {
          if (!isLive(gen)) return;
          setError(caught instanceof Error ? caught.message : "Transcription failed.");
        });
      return transcribeChain;
    }

    async function finish(gen: number) {
      if (gen !== takeGeneration || finishingRef.current || aborted.current) return;
      finishingRef.current = true;
      recordingRef.current = false;
      clearTimer();
      setPhase("classifying");

      const recorder = recorderRef.current;
      const stream = streamRef.current;
      const chunks = chunksRef.current;
      recorderRef.current = null;
      streamRef.current = null;

      let audioBlob: Blob | null = null;
      try {
        audioBlob = await stopRecorder(recorder, chunks);
      } catch {
        audioBlob = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (gen !== takeGeneration) return;
      classifyPlanRef.current = createClassifyPlan();

      let transcript = finalsRef.current;
      if (audioBlob && audioBlob.size > 0) {
        try {
          const next = await transcribeAudio(
            await blobToBase64(audioBlob),
            audioBlob.type || "audio/webm",
          );
          if (gen !== takeGeneration) return;
          transcript = next.transcript;
          finalsRef.current = next.transcript;
          if (!aborted.current) setScript(next);
        } catch (caught) {
          if (gen !== takeGeneration) return;
          if (!aborted.current) {
            setError(caught instanceof Error ? caught.message : "Transcription failed.");
          }
        }
      }

      if (gen !== takeGeneration) return;
      try {
        const saved = await listSessions();
        if (gen !== takeGeneration) return;
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
        if (gen !== takeGeneration) return;
        router.replace(`/sessions/${classification.id}`);
      } catch (caught) {
        if (gen !== takeGeneration || aborted.current) return;
        setError(caught instanceof Error ? caught.message : "Classification failed.");
        setPhase("recording");
        finishingRef.current = false;
      }
    }

    finishRef.current = () => {
      void finish(takeGeneration);
    };

    function watch(gen: number) {
      clearTimer();
      timerRef.current = window.setInterval(() => {
        if (!isLive(gen) || !recordingRef.current) return;
        const now = performance.now();
        if (
          takeEnds({
            elapsedMs: now - startedAtRef.current,
            msSinceLastWords: now - lastWordsAtRef.current,
            userStopped: false,
          })
        ) {
          void finish(gen);
          return;
        }
        const step = onClassifyTick(classifyPlanRef.current, now);
        classifyPlanRef.current = step.plan;
        if (step.send) publishLiveScore(gen, step.send);
      }, 100);
    }

    async function begin(gen: number) {
      let stream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("No microphone. Paste a transcript instead.");
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isLive(gen)) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = preferredMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.addEventListener("dataavailable", (event) => {
          if (!isLive(gen) || event.data.size === 0) return;
          chunksRef.current.push(event.data);
          if (recordingRef.current) queueTranscribe(gen);
        });
        recorderRef.current = recorder;
        const now = performance.now();
        startedAtRef.current = now;
        lastWordsAtRef.current = now;
        recordingRef.current = true;
        recorder.start(2000);
        watch(gen);
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (!isLive(gen)) return;
        setError(caught instanceof Error ? caught.message : "Could not start recording.");
      }
    }

    function startTake() {
      const gen = ++takeGeneration;
      finishingRef.current = false;
      releaseMedia();
      finalsRef.current = "";
      chunksRef.current = [];
      classifyPlanRef.current = createClassifyPlan();
      classifyGenRef.current += 1;
      transcribeChain = Promise.resolve();
      void begin(gen);
    }

    function resetVisibleTake() {
      setPhase("recording");
      setScript(emptyScript);
      setCriteria(emptyCriteria);
      setError(null);
    }

    function onPresented(command: "start" | "stop") {
      if (command === "start") {
        const restarting = takeGeneration !== 0;
        startTake();
        if (restarting) resetVisibleTake();
        return;
      }
      if (recordingRef.current) void finish(takeGeneration);
    }

    const present = isPresentMode(window.location.search);
    const unsubscribe = present ? setPresentedHandler(onPresented) : () => {};
    let queuedStart = false;
    if (present) {
      if (consumePresentedStart()) {
        queuedStart = true;
        startTake();
      }
    } else {
      startTake();
    }

    return () => {
      aborted.current = true;
      unsubscribe();
      if (queuedStart && !recordingRef.current && !finishingRef.current) {
        retainPresentedStart();
      }
      finishRef.current = () => {};
      if (!finishingRef.current) releaseMedia();
    };
  }, [router]);

  return (
    <RecordingPage
      criteria={criteria}
      recommendation={null}
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
