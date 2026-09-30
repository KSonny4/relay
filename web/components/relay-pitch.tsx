"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nextAttempt } from "@/lib/attempt-number";
import { startLiveSession, type LiveSession } from "@/lib/deepgram-live";
import {
  classifyLive,
  classifySession,
  fetchDeepgramAccessToken,
  getSession,
  listSessions,
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
import { formatScoreOutOfTen } from "@/lib/score-display";
import { applyTranscriptPiece, combineTranscript } from "@/lib/transcript";

type Phase = "idle" | "recording" | "classifying";

type OpenedTake = {
  id: string;
  score: number;
  level: string;
  recommendation: string;
  transcript: string;
};

export function RelayPitch() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [finals, setFinals] = useState("");
  const [interim, setInterim] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [liveScoreError, setLiveScoreError] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenedTake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const attemptRef = useRef(1);
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
  const sessionsRef = useRef<SessionRecord[]>([]);

  const rememberSessions = useCallback((next: SessionRecord[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      rememberSessions(await listSessions());
    } catch (caught) {
      setSessionsError(
        caught instanceof Error ? caught.message : "Could not load recordings.",
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [rememberSessions]);

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((next) => {
        if (cancelled) return;
        rememberSessions(next);
        setSessionsError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setSessionsError(
          caught instanceof Error ? caught.message : "Could not load recordings.",
        );
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rememberSessions]);

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
      setOpened({
        id: classification.id,
        score: classification.score,
        level: classification.level,
        recommendation: classification.recommendation,
        transcript,
      });
      setError(null);
      setPhase("idle");
      void loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classification failed.");
      setPhase("idle");
    } finally {
      finishingRef.current = false;
    }
  }

  async function startRecording() {
    if (phase === "recording") {
      await finishRecording();
      return;
    }
    if (startingRef.current || finishingRef.current || phase === "classifying") return;
    startingRef.current = true;
    attemptRef.current = nextAttempt(sessionsRef.current.map((session) => session.attempt));
    setError(null);
    setOpened(null);
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
        throw new Error("No microphone. Paste a transcript instead.");
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
    attemptRef.current = nextAttempt(sessionsRef.current.map((session) => session.attempt));
    setError(null);
    setOpened(null);
    setPhase("classifying");
    try {
      const classification = await classifySession({
        attempt: attemptRef.current,
        transcript,
      });
      setOpened({
        id: classification.id,
        score: classification.score,
        level: classification.level,
        recommendation: classification.recommendation,
        transcript,
      });
      setPaste("");
      setPasteOpen(false);
      setPhase("idle");
      void loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classification failed.");
      setPhase("idle");
    }
  }

  async function openRecording(id: string) {
    if (recordingRef.current || phase === "recording" || phase === "classifying") return;
    setError(null);
    try {
      const detail = await getSession(id);
      setOpened({
        id: detail.id,
        score: detail.score,
        level: detail.level,
        recommendation: detail.recommendation,
        transcript: detail.transcript,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that recording.");
    }
  }

  const liveTranscript = combineTranscript(finals, interim);
  const showingLive = phase === "recording" || phase === "classifying";
  const score = showingLive ? (liveScore?.score ?? null) : (opened?.score ?? null);
  const transcript = showingLive ? liveTranscript : (opened?.transcript ?? "");
  const history = [...sessions].sort(newestFirst);

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="flex items-center border-b border-black/10 px-8 py-5 xl:px-12">
        <p className="text-sm tracking-[0.18em] uppercase">Relay</p>
      </header>
      <div className="grid min-h-[calc(100vh-4.25rem)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="grid content-start gap-12 px-8 py-12 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:content-stretch xl:gap-20 xl:px-14 xl:py-16">
          <div className="flex flex-col">
            {showingLive || opened ? (
              <Rating score={score} pending={showingLive && score === null} />
            ) : (
              <h1 className="max-w-sm text-6xl leading-none tracking-tight xl:text-7xl">
                Record a pitch.
              </h1>
            )}
            {!showingLive && opened ? (
              <div className="mt-8 max-w-sm">
                <p className="text-lg leading-7">{opened.level}</p>
                <p className="mt-4 text-base leading-7 text-neutral-500">{opened.recommendation}</p>
              </div>
            ) : null}
            {showingLive ? (
              <p className="mt-6 text-sm text-neutral-500">
                {phase === "classifying" ? "Saving." : "Listening."}
              </p>
            ) : null}
            {liveScoreError ? <p className="mt-3 text-sm text-neutral-500">{liveScoreError}</p> : null}
            {error ? (
              <p role="alert" className="mt-4 max-w-sm text-sm">
                {error}
              </p>
            ) : null}
            <div className="mt-10">
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={phase === "classifying"}
                className="h-12 rounded-full bg-black px-8 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === "recording" ? "Stop" : phase === "classifying" ? "Saving" : "Record"}
              </button>
              {pasteOpen ? (
                <form
                  className="mt-8 max-w-sm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void classifyPaste();
                  }}
                >
                  <textarea
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                    rows={3}
                    placeholder="Paste a transcript"
                    className="w-full resize-none border-b border-black/20 bg-transparent py-2 text-sm leading-6 outline-none"
                  />
                  <button type="submit" className="mt-3 text-sm text-neutral-500 underline-offset-4 hover:underline">
                    Classify paste
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setPasteOpen(true)}
                  className="mt-4 block text-sm text-neutral-500"
                >
                  Paste a transcript
                </button>
              )}
            </div>
          </div>
          <div className="min-h-40 xl:min-h-0">
            <p className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Transcript</p>
            <div aria-live="polite" className="mt-4 text-2xl leading-snug xl:text-3xl xl:leading-snug">
              {transcript ? (
                transcript
              ) : (
                <span className="text-neutral-500">
                  {phase === "recording" ? "Waiting for speech." : "The words show up here."}
                </span>
              )}
            </div>
          </div>
        </main>
        <aside className="border-t border-black/10 px-8 py-10 lg:border-t-0 lg:border-l lg:px-8">
          <h2 className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Recordings</h2>
          {sessionsLoading ? (
            <p className="mt-8 text-sm text-neutral-500">Loading.</p>
          ) : sessionsError ? (
            <p role="alert" className="mt-8 text-sm">
              {sessionsError}
            </p>
          ) : history.length === 0 ? (
            <p className="mt-8 text-sm text-neutral-500">No recordings yet.</p>
          ) : (
            <ul className="mt-4">
              {history.map((session) => {
                const selected = opened?.id === session.id && !showingLive;
                return (
                  <li key={session.id} className="border-b border-black/10">
                    <button
                      type="button"
                      onClick={() => void openRecording(session.id)}
                      disabled={showingLive}
                      className={`flex w-full items-baseline justify-between gap-4 py-4 text-left text-sm disabled:cursor-default ${
                        selected ? "font-medium" : ""
                      }`}
                    >
                      <time dateTime={session.createdAt}>{formatSessionTime(session.createdAt)}</time>
                      <span className="tabular-nums">{formatScoreOutOfTen(session.score)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function Rating({ score, pending }: { score: number | null; pending: boolean }) {
  const label = score === null ? "— / 10" : formatScoreOutOfTen(score);
  const [value, scale] = label.split(" / ");
  return (
    <p
      className={`text-8xl leading-none tracking-tight xl:text-[8.5rem] ${pending ? "text-neutral-400" : "text-black"}`}
      aria-label={label}
    >
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-[0.32em] font-normal text-neutral-500"> / {scale}</span>
    </p>
  );
}

function newestFirst(a: SessionRecord, b: SessionRecord): number {
  const left = Date.parse(a.createdAt);
  const right = Date.parse(b.createdAt);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return right - left;
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
