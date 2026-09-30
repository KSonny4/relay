export type Criteria = {
  execution: number | null;
  usefulness: number | null;
  clarity: number | null;
};

export const emptyCriteria: Criteria = {
  execution: null,
  usefulness: null,
  clarity: null,
};

/** Read the three criteria. A lone `score` is not turned into these numbers. */
export function readCriteria(body: object): Criteria {
  const record = body as Record<string, unknown>;
  return {
    execution: finiteNumber(record.execution),
    usefulness: finiteNumber(record.usefulness),
    clarity: finiteNumber(record.clarity),
  };
}

/** Total is (execution × 2) + usefulness + clarity, and only when all three are present. */
export function criteriaTotal(criteria: Criteria): number | null {
  const { execution, usefulness, clarity } = criteria;
  if (execution === null || usefulness === null || clarity === null) return null;
  return execution * 2 + usefulness + clarity;
}

export function shownCriterion(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function shownTotal(criteria: Criteria): string {
  const total = criteriaTotal(criteria);
  return total === null ? "—" : `${total} / 20`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
