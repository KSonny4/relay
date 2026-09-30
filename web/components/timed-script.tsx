import { formatScriptClock, type TranscriptScript } from "@/lib/transcript-script";

export function TimedScript({ script }: { script: TranscriptScript }) {
  if (script.sentences.length > 0) {
    return (
      <ol className="flex flex-col">
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