/* Dates are handled as plain ISO strings in local time. Parsing "2026-09-19"
   with `new Date()` would read it as UTC and shift the day for anyone west of
   Greenwich, so the parts are split by hand. */

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = (): string => iso(new Date());

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);

export const prettyDate = (s: string): string =>
  parseISO(s).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

export const fmtTime = (s: string): string => (s || "").replace(/^0/, "");

export function fmtDur(m: number): string {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export const n0 = (x: number): string => Math.round(x).toLocaleString();

/** Rough minutes for a quantity of work, used until you set a duration yourself. */
export function estimateMins(unit: string, target: number): number {
  const per: Record<string, number> = {
    questions: 1.4, sujets: 8, notes: 15, items: 3, done: 5, sections: 45,
  };
  return Math.max(5, Math.round((per[unit] ?? 5) * target));
}
