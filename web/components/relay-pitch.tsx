"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startLiveSession, type LiveSession } from "@/lib/deepgram-live";
import {
  classifyLive,
  classifySession,
  fetchDeepgramAccessToken,
  listSessions,
  type Attempt,
  type Classification,
  type LiveScore,
  type SessionRecord,
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

type Phase = "idle" | "recording" | "classifying" | "done";

export function RelayPitch() {
  const [attempt, setAttempt] = useState<Attempt>(1);
  const [phase, setPhase] = useState<Phase>("idle");
  const [finals, setFinals] = useState("");
  const [interim, setInterim] = useState("");
  const [paste, setPaste] = useState("");
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [liveScoreError, setLiveScoreError] = useState<string | null>(null);
  const [result, setResult] = useState<Classification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const attemptRef = useRef<Attempt>(1);
  const finalsRef = useRef("");
  const interimRef = useRef("");
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const timerRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const finishingRef = useRef(false);
  const classifyPlanRef = useRef<ClassifyPlan>(createClassifyPlan());
  const classifyGenRef = useRef(0);
  const takeIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastWordsAtRef = useRef(0);
  const recordingRef = useRef(false);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions(await listSessions());
    } catch (caught) {
      setSessionsError(
        caught instanceof Error ? caught.message : "Could not load past sessions.",
      );
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((next) => {
        if (cancelled) return;
        setSessions(next);
        setSessionsError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setSessionsError(
          caught instanceof Error ? caught.message : "Could not load past sessions.",
        );
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      liveRef.current?.close();
      takeIdRef.current += 1;
    };
  }, []);

  function selectAttempt(next: Attempt) {
    if (phase === "recording" || phase === "classifying") return;
    attemptRef.current = next;
    setAttempt(next);
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function publishLiveScore(transcript: string, takeId: number) {
    const generation = ++classifyGenRef.current;
    void classifyLive(transcript)
      .then((score) => {
        if (takeId !== takeIdRef.current || generation !== classifyGenRef.current) return;
        setLiveScore(score);
        setLiveScoreError(null);
      })
      .catch((caught: unknown) => {
        if (takeId !== takeIdRef.current || generation !== classifyGenRef.current) return;
        setLiveScoreError(
          caught instanceof Error ? caught.message : "Live score update failed.",
        );
      });
  }

  function rememberTranscript(text: string, isFinal: boolean) {
    if (!recordingRef.current) return;
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
    if (step.send) publishLiveScore(step.send, takeIdRef.current);
  }

  function watchTake(takeId: number) {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      if (!recordingRef.current) return;
      const now = performance.now();
      const elapsedMs = now - startedAtRef.current;
      const msSinceLastWords = now - lastWordsAtRef.current;
      if (takeEnds({ elapsedMs, msSinceLastWords, userStopped: false })) {
        void finishRecording();
        return;
      }
      const step = onClassifyTick(classifyPlanRef.current, now);
      classifyPlanRef.current = step.plan;
      if (step.send) publishLiveScore(step.send, takeId);
    }, 100);
  }

  async function finishRecording() {
    if (finishingRef.current) return;
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

    const transcript = combineTranscript(finalsRef.current, interimRef.current);
    try {
      const classification = await classifySession({
        attempt: attemptRef.current,
        transcript,
        ...(audioBlob && audioBlob.size > 0
          ? {
              audioBase64: await blobToBase64(audioBlob),
              ...(audioBlob.type ? { mimeType: audioBlob.type } : {}),
            }
          : {}),
      });
      setResult(classification);
      setError(null);
      setPhase("done");
      void loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classification failed.");
      setPhase("idle");
    } finally {
      finishingRef.current = false;
    }
  }

  async function startRecording() {
    if (
      startingRef.current ||
      finishingRef.current ||
      phase === "recording" ||
      phase === "classifying"
    ) {
      return;
    }
    startingRef.current = true;
    setError(null);
    setResult(null);
    setLiveScore(null);
    setLiveScoreError(null);
    finalsRef.current = "";
    interimRef.current = "";
    chunksRef.current = [];
    classifyPlanRef.current = createClassifyPlan();
    setFinals("");
    setInterim("");

    const takeId = takeIdRef.current + 1;
    takeIdRef.current = takeId;

    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser has no microphone. Paste a transcript to classify.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const accessToken = await fetchDeepgramAccessToken();
      const live = await startLiveSession(
        accessToken,
        rememberTranscript,
        (liveError) => setError(liveError.message),
      );
      liveRef.current = live;

      const mimeType = preferredMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
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
      watchTake(takeId);
    } catch (caught) {
      recordingRef.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      liveRef.current?.close();
      liveRef.current = null;
      recorderRef.current = null;
      clearTimer();
      setError(caught instanceof Error ? caught.message : "Could not start recording.");
      setPhase("idle");
    } finally {
      startingRef.current = false;
    }
  }

  async function classifyPaste() {
    const transcript = paste.trim();
    if (!transcript) {
      setError("Paste a transcript before classifying.");
      return;
    }
    if (phase === "recording" || phase === "classifying") return;
    setError(null);
    setResult(null);
    setLiveScore(null);
    setPhase("classifying");
    try {
      const classification = await classifySession({
        attempt: attemptRef.current,
        transcript,
      });
      setResult(classification);
      setPhase("done");
      void loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classification failed.");
      setPhase("idle");
    }
  }

  const showResult = phase === "done" && result !== null;
  const showLiveScore = !showResult && (phase === "recording" || phase === "classifying" || liveScore !== null);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-amber-800 uppercase">Relay</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
          Pitch classification
        </h1>
        <p className="max-w-xl text-base leading-7 text-stone-600">
          Record a pitch for an idea that helps developers. There is no time limit. Press
          stop when you are done. About 10 seconds with no new words also ends the take.
          The score updates while you speak. The recommendation appears after the take ends.
        </p>
      </header>

      <section className="flex flex-col gap-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AttemptButton
            selected={attempt === 1}
            disabled={phase === "recording" || phase === "classifying"}
            onClick={() => selectAttempt(1)}
            title="Attempt 1"
          />
          <AttemptButton
            selected={attempt === 2}
            disabled={phase === "recording" || phase === "classifying"}
            onClick={() => selectAttempt(2)}
            title="Attempt 2"
          />
        </div>

        <p className="text-sm text-stone-500">
          {phase === "recording"
            ? "Recording. The score updates as each phrase finishes."
            : phase === "classifying"
              ? "Saving this attempt."
              : "No time limit. Stop when you are done, or after about 10 seconds without new words."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={phase === "recording" || phase === "classifying"}
            className="h-12 flex-1 rounded-full bg-stone-950 px-5 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {phase === "recording" ? "Recording" : `Start attempt ${attempt}`}
          </button>
          <button
            type="button"
            onClick={() => void finishRecording()}
            disabled={phase !== "recording"}
            className="h-12 flex-1 rounded-full border border-stone-300 px-5 text-base font-medium text-stone-950 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            Stop and save
          </button>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {showLiveScore ? (
          <LiveScorePanel score={liveScore} error={liveScoreError} waiting={phase === "recording" && liveScore === null} />
        ) : null}

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-stone-700">Live transcript</h2>
          <div
            aria-live="polite"
            className="min-h-28 rounded-xl bg-stone-50 px-4 py-3 text-base leading-7 text-stone-800"
          >
            {finals || interim.trim() ? (
              <>
                {finals}
                {interim.trim() ? (
                  <span className="text-stone-500">
                    {finals.trim() ? " " : ""}
                    {interim.trim()}
                  </span>
                ) : null}
              </>
            ) : phase === "recording" ? (
              "Waiting for speech…"
            ) : (
              "The transcript appears here while the microphone is open."
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Paste a transcript</h2>
        <p className="text-sm leading-6 text-stone-600">
          Use this when the microphone or Deepgram token is missing. Classify saves the
          attempt and shows the same end screen as a recording.
        </p>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={5}
          placeholder="Paste the pitch transcript"
          className="w-full resize-y rounded-xl border border-stone-300 px-4 py-3 text-base leading-7 text-stone-900 outline-none focus:border-stone-950"
        />
        <button
          type="button"
          onClick={() => void classifyPaste()}
          disabled={phase === "recording" || phase === "classifying"}
          className="h-12 rounded-full bg-amber-800 px-5 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300 sm:self-start sm:px-8"
        >
          Classify
        </button>
      </section>

      {showResult && result ? <ClassificationCard result={result} /> : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-stone-950">Past sessions</h2>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="text-sm font-medium text-stone-600 underline-offset-4 hover:underline"
          >
            Refresh
          </button>
        </div>
        {sessionsLoading ? (
          <p className="text-sm text-stone-500">Loading past sessions…</p>
        ) : sessionsError ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {sessionsError}
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-stone-500">No pitches classified yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="grid grid-cols-1 gap-1 px-4 py-3 text-sm sm:grid-cols-3 sm:items-center"
              >
                <span className="font-medium text-stone-950">Attempt {session.attempt}</span>
                <span className="text-stone-700">Score {session.score}</span>
                <time dateTime={session.createdAt} className="text-stone-500 sm:text-right">
                  {formatSessionTime(session.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function AttemptButton({
  selected,
  disabled,
  onClick,
  title,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left text-base font-medium disabled:cursor-not-allowed ${
        selected
          ? "border-stone-950 bg-stone-950 text-white"
          : "border-stone-300 bg-white text-stone-950"
      }`}
    >
      {title}
    </button>
  );
}

function LiveScorePanel({
  score,
  error,
  waiting,
}: {
  score: LiveScore | null;
  error: string | null;
  waiting: boolean;
}) {
  return (
    <section aria-live="polite" aria-label="Live score" className="rounded-2xl bg-stone-950 px-5 py-6 text-white">
      <p className="text-sm text-stone-400">Live score</p>
      {score ? (
        <>
          <p className="mt-2 text-7xl font-semibold tabular-nums sm:text-8xl">{score.score}</p>
          <p className="mt-4 text-xl leading-8">{score.level}</p>
          <p className="mt-3 text-sm text-stone-300">Confidence {score.confidence}</p>
        </>
      ) : (
        <p className="mt-3 text-2xl font-medium">
          {waiting ? "Waiting for a finished phrase." : "No score yet."}
        </p>
      )}
      <p className="mt-4 text-sm text-stone-400">
        The recommendation appears when the take ends.
      </p>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </section>
  );
}

function ClassificationCard({ result }: { result: Classification }) {
  return (
    <section aria-label="Final classification" className="rounded-2xl bg-stone-950 p-5 text-white sm:p-8">
      <p className="text-sm text-stone-400">Attempt {result.attempt} ended</p>
      <h2 className="mt-2 text-lg font-semibold">Final score</h2>
      <dl className="mt-6 grid gap-5">
        <div>
          <dt className="text-sm text-stone-400">Overall score</dt>
          <dd className="mt-1 text-5xl font-semibold tabular-nums">{result.score}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-400">Level</dt>
          <dd className="mt-1 text-xl leading-8">{result.level}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-400">Confidence</dt>
          <dd className="mt-1 text-xl tabular-nums">{result.confidence}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-400">Recommendation</dt>
          <dd className="mt-1 text-base leading-7 text-stone-100">{result.recommendation}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatSessionTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
    recorder.addEventListener(
      "stop",
      () => resolve(blobFromChunks(chunks, recorder.mimeType)),
      { once: true },
    );
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
