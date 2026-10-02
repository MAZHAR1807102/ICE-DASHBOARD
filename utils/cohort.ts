// Every semester has two groups: Regular (the batch that is normally in that semester) and Readd
// (re-admitted students from earlier batches). The batch is the RU ID series — its first 7 digits
// (session + college code, e.g. 2638520…); the last 3 digits are the serial.
// Within a semester, the series most students share is Regular; everyone else is Readd.

export type Cohort = 'regular' | 'readd';
type Classifiable = { id: string; semester: number; ru_id: string | null; college_id: string };

export const rollSeries = (ruId: string | null) => {
  const digits = (ruId ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, -3) : null;
};

// Classify from the FULL student list (not a filtered view), so search filters don't change who's Regular.
export function classifyCohorts(students: Classifiable[]): Map<string, Cohort> {
  const result = new Map<string, Cohort>();
  const bySemester = new Map<number, Classifiable[]>();
  students.forEach((s) => bySemester.set(s.semester, [...(bySemester.get(s.semester) ?? []), s]));

  bySemester.forEach((list) => {
    const counts = new Map<string, number>();
    list.forEach((s) => { const k = rollSeries(s.ru_id); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
    const regularSeries = [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];

    // Students without an RU ID: compare their College ID prefix with the regular students' prefix.
    const prefixCounts = new Map<string, number>();
    list.filter((s) => rollSeries(s.ru_id) === regularSeries).forEach((s) => {
      const p = s.college_id.slice(0, 2);
      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
    });
    const regularPrefix = [...prefixCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

    list.forEach((s) => {
      const series = rollSeries(s.ru_id);
      const regular = series ? series === regularSeries : !regularPrefix || s.college_id.slice(0, 2) === regularPrefix;
      result.set(s.id, regular ? 'regular' : 'readd');
    });
  });
  return result;
}

const rollKey = (s: { ru_id: string | null; college_id: string }) => (s.ru_id ?? '').replace(/\D/g, '') || `~${s.college_id}`;

// Semester ascending → Regular before Readd → roll (RU ID, else College ID) ascending.
export function orderByCohort<T extends Classifiable>(list: T[], cohorts: Map<string, Cohort>): T[] {
  return [...list].sort((a, b) =>
    a.semester - b.semester ||
    (cohorts.get(a.id) === 'readd' ? 1 : 0) - (cohorts.get(b.id) === 'readd' ? 1 : 0) ||
    rollKey(a).localeCompare(rollKey(b), undefined, { numeric: true }),
  );
}

// The first student of each group gets a heading ("Regular · 25 students") shown above them.
export type GroupHeadingInfo = { label: string; count: number; cohort: Cohort };
export function groupHeadings<T extends Classifiable>(ordered: T[], cohorts: Map<string, Cohort>, showSemester: boolean) {
  const headings = new Map<string, GroupHeadingInfo>();
  let current = '';
  ordered.forEach((s) => {
    const cohort = cohorts.get(s.id) ?? 'regular';
    const key = `${s.semester}:${cohort}`;
    if (key === current) return;
    current = key;
    headings.set(s.id, {
      cohort,
      count: ordered.filter((o) => o.semester === s.semester && (cohorts.get(o.id) ?? 'regular') === cohort).length,
      label: `${showSemester ? `Semester ${s.semester} · ` : ''}${cohort === 'regular' ? 'Regular' : 'Readd'}`,
    });
  });
  return headings;
}

export type CohortFilter = 'all' | Cohort;
export const matchesCohort = (filter: CohortFilter, cohort: Cohort | undefined) => filter === 'all' || (cohort ?? 'regular') === filter;
