"use client";

import { useEffect, useState } from "react";
import { DeskFrame } from "@/components/desk-frame";
import { Rating } from "@/components/rating";
import { getSession, type SessionDetail } from "@/lib/relay-api";

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
      <main className="grid flex-1 grid-cols-[minmax(28rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-r border-black/10 px-12 py-16">
          <Rating score={detail?.score ?? null} pending={!detail && !error} />
        </div>
        <div className="px-12 py-16">
          <p className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Next</p>
          <div className="mt-8 text-4xl leading-snug">
            {error ? (
              <p role="alert" className="text-base">
                {error}
              </p>
            ) : detail ? (
              detail.recommendation
            ) : (
              <p className="text-neutral-500">Opening.</p>
            )}
          </div>
        </div>
      </main>
    </DeskFrame>
  );
}
