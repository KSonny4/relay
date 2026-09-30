import { formatScoreOutOfTen } from "@/lib/score-display";

export function Rating({ score, pending = false }: { score: number | null; pending?: boolean }) {
  const label = score === null ? "— / 10" : formatScoreOutOfTen(score);
  const [value, scale] = label.split(" / ");
  return (
    <p
      className={`text-[clamp(3.5rem,14vw,8.5rem)] leading-none tracking-tight ${pending ? "text-neutral-400" : "text-black"}`}
      aria-label={label}
    >
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-[0.32em] font-normal text-neutral-500"> / {scale}</span>
    </p>
  );
}
