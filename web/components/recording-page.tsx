import Link from "next/link";
import { CriteriaScore } from "@/components/criteria-score";
import { TimedScript } from "@/components/timed-script";
import {
  LIVE_TAKE_BOTTOM_RESERVE_PX,
  SAVED_SESSION_BOTTOM_RESERVE_PX,
} from "@/lib/follow-transcript";
import { showsNextFix } from "@/lib/next-fix";
import type { Criteria } from "@/lib/score-display";
import type { TranscriptScript } from "@/lib/transcript-script";

export function RecordingPage({
  criteria,
  recommendation,
  script,
  waiting,
  error,
  stop,
}: {
  criteria: Criteria;
  recommendation: string | null;
  script: TranscriptScript;
  waiting?: string | null;
  error?: string | null;
  stop?: { label: "Stop" | "Saving"; onClick: () => void };
}) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="px-[clamp(1.25rem,4vw,3rem)] py-5">
        <Link href="/" className="text-base text-white">
          Recordings
        </Link>
      </header>
      <div className={`px-[clamp(1.25rem,4vw,3rem)] ${stop ? "pb-28" : "pb-16"}`}>
        {error ? (
          <p role="alert" className="mb-8 text-sm text-white">
            {error}
          </p>
        ) : null}
        <CriteriaScore criteria={criteria} />
        <div className="mt-12" aria-live="polite">
          {waiting && !script.transcript && script.sentences.length === 0 ? (
            <p className="text-neutral-500">{waiting}</p>
          ) : (
            <TimedScript
              script={script}
              reservePx={stop ? LIVE_TAKE_BOTTOM_RESERVE_PX : SAVED_SESSION_BOTTOM_RESERVE_PX}
            />
          )}
        </div>
        {showsNextFix(recommendation) ? (
          <div className="mt-12 flex items-start gap-4">
            <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-white px-4 text-sm font-medium text-black">
              What to fix next pitch:
            </span>
            <p className="min-w-0 pt-2 text-[clamp(1.05rem,2vw,1.35rem)] leading-snug text-white">
              {recommendation}
            </p>
          </div>
        ) : null}
      </div>
      {stop ? (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-4">
          <button
            type="button"
            onClick={stop.onClick}
            className="inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-medium text-black"
          >
            {stop.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}
