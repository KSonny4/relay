import {
  shownCriterion,
  shownTotal,
  type Criteria,
} from "@/lib/score-display";

const ROWS = [
  ["Execution", "execution"],
  ["Usefulness", "usefulness"],
  ["Clarity", "clarity"],
] as const;

export function CriteriaScore({ criteria }: { criteria: Criteria }) {
  return (
    <div>
      <ul>
        {ROWS.map(([label, key]) => (
          <li
            key={key}
            className="flex items-baseline justify-between gap-4 border-b border-black/10 py-3 md:py-4"
          >
            <span className="text-xs tracking-[0.16em] text-neutral-500 uppercase">{label}</span>
            <span className="text-[clamp(1.75rem,4vw,3rem)] leading-none tabular-nums">
              {shownCriterion(criteria[key])}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-baseline justify-between gap-4">
        <span className="text-xs tracking-[0.16em] text-neutral-500 uppercase">Total</span>
        <span className="text-[clamp(2rem,5vw,3.5rem)] leading-none tabular-nums">{shownTotal(criteria)}</span>
      </p>
    </div>
  );
}
