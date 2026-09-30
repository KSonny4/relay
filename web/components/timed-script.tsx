import { formatSentenceSpan, type TranscriptScript } from "@/lib/transcript-script";

export function TimedScript({ script }: { script: TranscriptScript }) {
  if (script.sentences.length > 0) {
    return (
      <ol className="flex flex-col">
        {script.sentences.map((sentence, index) => (
          <li
            key={`${sentence.start}-${sentence.end}-${index}`}
            className="flex items-baseline gap-4 py-3 md:gap-8"
          >
            <span className="w-[6.5rem] shrink-0 text-sm text-neutral-500 tabular-nums md:w-[7.5rem]">
              {formatSentenceSpan(sentence)}
            </span>
            <span className="min-w-0 text-[clamp(1.05rem,2vw,1.35rem)] leading-snug break-words text-white">
              {sentence.text}
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
