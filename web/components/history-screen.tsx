"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeskFrame } from "@/components/desk-frame";
import { nextAttempt } from "@/lib/attempt-number";
import { classifySession, listSessions, type SessionRecord } from "@/lib/relay-api";
import { shownCriterion, shownTotal } from "@/lib/score-display";

export function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [saving, setSaving] = useState(false);
  const sessionsRef = useRef<SessionRecord[]>([]);

  const remember = useCallback((next: SessionRecord[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((next) => {
        if (cancelled) return;
        remember(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load recordings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remember]);

  async function classifyPaste() {
    const transcript = paste.trim();
    if (!transcript || saving) return;
    setSaving(true);
    setError(null);
    try {
      const attempt = nextAttempt(sessionsRef.current.map((session) => session.attempt));
      const classification = await classifySession({ attempt, transcript });
      router.push(`/sessions/${classification.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classification failed.");
      setSaving(false);
    }
  }

  const history = [...sessions].sort(newestFirst);

  return (
    <DeskFrame>
      <main className="w-full px-[clamp(1.25rem,4vw,3rem)] py-8 md:py-10">
        <h1 className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Recordings</h1>
        {loading ? (
          <p className="mt-10 text-sm text-neutral-500">Loading.</p>
        ) : error && history.length === 0 ? (
          <p role="alert" className="mt-10 text-sm">
            {error}
          </p>
        ) : history.length === 0 ? (
          <p className="mt-10 text-sm text-neutral-500">No recordings yet.</p>
        ) : (
          <ul className="mt-4">
            {history.map((session) => (
              <li key={session.id} className="border-b border-black/10">
                <Link
                  href={`/sessions/${session.id}`}
                  className="flex flex-col gap-3 py-4 md:flex-row md:items-baseline md:justify-between md:gap-8 md:py-5"
                >
                  <time dateTime={session.createdAt} className="shrink-0 text-base md:text-lg">
                    {formatSessionTime(session.createdAt)}
                  </time>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1 text-sm md:text-base">
                    <span>
                      Execution <span className="tabular-nums">{shownCriterion(session.execution)}</span>
                    </span>
                    <span>
                      Usefulness <span className="tabular-nums">{shownCriterion(session.usefulness)}</span>
                    </span>
                    <span>
                      Clarity <span className="tabular-nums">{shownCriterion(session.clarity)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-lg tabular-nums">{shownTotal(session)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {error && history.length > 0 ? (
          <p role="alert" className="mt-6 text-sm">
            {error}
          </p>
        ) : null}
        <div className="mt-10">
          {pasteOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!paste.trim()) {
                  setError("Paste a transcript before classifying.");
                  return;
                }
                void classifyPaste();
              }}
            >
              <textarea
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                rows={2}
                placeholder="Paste a transcript"
                className="w-full resize-none border-b border-black/20 bg-transparent py-2 text-sm leading-6 outline-none"
              />
              <button
                type="submit"
                disabled={saving}
                className="mt-3 text-sm text-neutral-500 underline-offset-4 hover:underline disabled:opacity-40"
              >
                {saving ? "Saving" : "Classify paste"}
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setPasteOpen(true)} className="text-sm text-neutral-500">
              Paste a transcript
            </button>
          )}
        </div>
      </main>
    </DeskFrame>
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
