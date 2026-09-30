"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  distanceFromBottom,
  followAfterScriptChange,
  followNewestAfterScroll,
  scrollTopForNewestRow,
} from "@/lib/follow-transcript";
import { formatScriptClock, type TranscriptScript } from "@/lib/transcript-script";

export function TimedScript({
  script,
  reservePx,
}: {
  script: TranscriptScript;
  reservePx: number;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const followingRef = useRef(true);
  const programmaticRef = useRef(false);
  const sentenceKey = script.sentences.map((sentence) => `${sentence.start}\n${sentence.text}`).join("\n");

  useEffect(() => {
    function onScroll() {
      const scrolling = document.scrollingElement;
      if (!scrolling) return;
      followingRef.current = followNewestAfterScroll({
        programmatic: programmaticRef.current,
        wasFollowing: followingRef.current,
        distanceFromBottomPx: distanceFromBottom(
          scrolling.scrollHeight,
          scrolling.scrollTop,
          scrolling.clientHeight,
        ),
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    followingRef.current = followAfterScriptChange({
      sentenceCount: script.sentences.length,
      wasFollowing: followingRef.current,
    });
    if (!followingRef.current || script.sentences.length === 0) return;

    const last = listRef.current?.lastElementChild;
    const scrolling = document.scrollingElement;
    if (!(last instanceof HTMLElement) || !scrolling) return;

    const rect = last.getBoundingClientRect();
    const next = scrollTopForNewestRow({
      scrollTop: scrolling.scrollTop,
      viewportHeight: scrolling.clientHeight,
      rowTop: rect.top + scrolling.scrollTop,
      rowHeight: rect.height,
      reservePx,
    });
    if (next === null) return;

    programmaticRef.current = true;
    scrolling.scrollTop = next;
    const frame = window.requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      programmaticRef.current = false;
    };
  }, [sentenceKey, reservePx, script.sentences.length]);

  if (script.sentences.length > 0) {
    return (
      <ol ref={listRef} className="flex flex-col">
        {script.sentences.map((sentence, index) => (
          <li
            key={`${sentence.start}-${index}`}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <span className="min-w-0 text-[clamp(1.05rem,2vw,1.35rem)] leading-snug break-words text-white">
              {sentence.text}
            </span>
            <span className="shrink-0 text-sm text-neutral-500 tabular-nums">
              {formatScriptClock(sentence.start)}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p className="text-[clamp(1.05rem,2vw,1.35rem)] leading-snug break-words text-white">
      {script.transcript || "—"}
    </p>
  );
}
