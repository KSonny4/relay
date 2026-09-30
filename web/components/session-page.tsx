"use client";

import { useEffect, useState } from "react";
import { DeskFrame } from "@/components/desk-frame";
import { CriteriaScore } from "@/components/criteria-score";
import { TimedScript } from "@/components/timed-script";
import { getSession, type SessionDetail } from "@/lib/relay-api";
import { emptyCriteria } from "@/lib/score-display";

export function SessionPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession(id)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not open that recording.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <DeskFrame>
      <main className="grid flex-1 grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-b border-black/10 px-[clamp(1.25rem,4vw,3rem)] py-10 md:border-r md:border-b-0 md:py-16">
          <CriteriaScore criteria={detail ?? emptyCriteria} />
        </div>
        <div className="px-[clamp(1.25rem,4vw,3rem)] py-10 md:py-16">
          <p className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Transcript</p>
          <div className="mt-6">
            {detail ? (
              <TimedScript script={detail} />
            ) : (
              <p className="text-neutral-500">Opening.</p>
            )}
          </div>
          <p className="mt-10 text-xs tracking-[0.16em] text-neutral-500 uppercase">Next</p>
          <div className="mt-6 text-[clamp(1.5rem,2.4vw,2.25rem)] leading-snug break-words">
            {error ? (
              <p role="alert" className="text-base">
                {error}
              </p>
            ) : detail?.recommendation ? (
              detail.recommendation
            ) : detail ? (
              "—"
            ) : null}
          </div>
        </div>
      </main>
    </DeskFrame>
  );
}
