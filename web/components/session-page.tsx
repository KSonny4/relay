"use client";

import { useEffect, useState } from "react";
import { RecordingPage } from "@/components/recording-page";
import { getSession, type SessionDetail } from "@/lib/relay-api";
import { criteriaTotal, emptyCriteria } from "@/lib/score-display";
import { emptyScript } from "@/lib/transcript-script";

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

  const total = detail ? criteriaTotal(detail) : null;

  return (
    <RecordingPage
      criteria={detail ?? emptyCriteria}
      recommendation={detail?.recommendation ?? null}
      script={detail ?? emptyScript}
      waiting={detail ? null : "Opening."}
      error={error}
      showFix={detail !== null && total !== 20}
    />
  );
}
