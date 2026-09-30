import { criteriaTotal, shownCriterion, type Criteria } from "@/lib/score-display";

const CRITERIA = [
  ["Execution", "execution"],
  ["Usefulness", "usefulness"],
  ["Clarity", "clarity"],
] as const;

export function CriteriaScore({ criteria }: { criteria: Criteria }) {
  const total = criteriaTotal(criteria);
  return (
    <div className="grid grid-cols-4 gap-2 md:gap-6">
      {CRITERIA.map(([label, key]) => (
        <ScoreBadge key={key} value={shownCriterion(criteria[key])} scale="/ 5" label={label} />
      ))}
      <ScoreBadge value={total === null ? "—" : String(total)} scale="/ 20" label="Total" />
    </div>
  );
}

function ScoreBadge({ value, scale, label }: { value: string; scale: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <p className="text-center leading-none text-white">
        <span className="text-[clamp(2.25rem,7vw,5.5rem)] font-medium tabular-nums">{value}</span>
        <span className="ml-1 text-[clamp(0.75rem,1.6vw,1.15rem)] text-neutral-500">{scale}</span>
      </p>
      <span className="inline-flex max-w-full items-center justify-center rounded-full bg-white px-2.5 py-1.5 text-[0.7rem] font-medium text-black md:px-4 md:text-sm">
        {label}
      </span>
    </div>
  );
}
