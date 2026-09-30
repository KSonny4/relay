import {
  formatSentenceSpan,
  type TranscriptScript,
} from "@/lib/transcript-script";

export function TimedScript({ script }: { script: TranscriptScript }) {
  if (script.sentences.length > 0) {
    return (
      <ol className="flex flex-col">
        {script.sentences.map((sentence, index) => (
          <li
            key={`${sentence.start}-${sentence.end}-${index}`}
            className="flex flex-col gap-1 border-b border-black/10 py-4 md:flex-row md:items-baseline md:gap-8"
          >
            <span className="shrink-0 text-sm text-neutral-500 tabular-nums">
              {formatSentenceSpan(sentence)}
            </span>
            <span className="text-[clamp(1.25rem,2.2vw,1.75rem)] leading-snug break-words">
              {sentence.text}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p className="text-[clamp(1.5rem,2.4vw,2.25rem)] leading-snug break-words">
      {script.transcript || "—"}
    </p>
  );
}
