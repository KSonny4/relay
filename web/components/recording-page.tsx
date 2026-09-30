import Link from "next/link";
import { CriteriaScore } from "@/components/criteria-score";
import { TimedScript } from "@/components/timed-script";
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
      <header className="flex items-center justify-between gap-4 px-[clamp(1.25rem,4vw,3rem)] py-5">
        <Link href="/" className="text-base text-white">
          Recordings
        </Link>
        {stop ? (
          <button
            type="button"
            onClick={stop.onClick}
            className="inline-flex h-12 shrink-0 items-center rounded-full bg-white px-6 text-sm font-medium text-black"
          >
            {stop.label}
          </button>
        ) : null}
      </header>
      <div className="px-[clamp(1.25rem,4vw,3rem)] pb-16">
        {error ? (
          <p role="alert" className="mb-8 text-sm text-white">
            {error}
          </p>
        ) : null}
        <CriteriaScore criteria={criteria} />
        <div className="mt-10 flex items-start gap-4">
          <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-white px-4 text-sm font-medium text-black">
            Next
          </span>
          <p className="min-w-0 pt-2 text-[clamp(1.05rem,2vw,1.35rem)] leading-snug text-white">
            {recommendation || "—"}
          </p>
        </div>
        <div className="mt-12" aria-live="polite">
          {waiting && !script.transcript && script.sentences.length === 0 ? (
            <p className="text-neutral-500">{waiting}</p>
          ) : (
            <TimedScript script={script} />
          )}
        </div>
      </div>
    </div>
  );
}
