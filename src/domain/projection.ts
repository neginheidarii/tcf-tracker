import { BANKS, SKILLS } from "./banks";
import { addDays } from "./dates";
import type { Plan, Skill, Task } from "./types";

/* Drift: days you skip don't disappear, the work moves onto the days that are
   left. This turns that into numbers — per skill, and as a what-if. */

export interface SkillOutlook {
  skill: Skill;
  label: string;
  abbr: string;
  unit: string;
  color: string;
  remaining: number;
  /** Logged per day over the trailing fortnight. */
  perDay: number;
  /** The daily pace the plan asked for on day one. */
  asked: number;
  /** The daily pace it asks for now. */
  needed: number;
  /** How far short of where the plan expected you to be by now. */
  behindBy: number;
  /** What would still be unseen on exam day at your recent pace. */
  shortfall: number;
  /** The same bank spread over fewer days, if you sit out n more. */
  ifMissed: (n: number) => number | null;
}

export interface Projection {
  /** Whole days that have already passed inside the plan. */
  elapsed: number;
  studied: number;
  missed: number;
  skills: SkillOutlook[];
  /** Only the banks with work left to do. */
  live: SkillOutlook[];
  behind: SkillOutlook[];
  atRisk: SkillOutlook[];
  verdict: "clear" | "ok" | "slipping" | "off";
}

const studiedOn = (tasks: Task[] | undefined): boolean =>
  !!tasks && tasks.some((t) => t.status === "done" || t.actual > 0);

export interface ProjectionContext {
  todayIndex: number;
  planLength: number;
  daysLeft: number;
  banked: Record<Skill, Record<string, number>>;
  pace: Record<Skill, number>;
  byDate: Map<string, Task[]>;
}

export function projection(plan: Plan, ctx: ProjectionContext): Projection {
  const { todayIndex, planLength, daysLeft, banked, pace, byDate } = ctx;
  const elapsed = Math.max(0, Math.min(todayIndex - 1, planLength));

  let studied = 0;
  for (let i = 0; i < elapsed; i++) {
    if (studiedOn(byDate.get(addDays(plan.startDate, i)))) studied++;
  }

  const skills: SkillOutlook[] = SKILLS.map((sk) => {
    const bank = BANKS[sk];
    const target = plan.targets[sk];
    const credited = Object.values(plan.baselines[sk]).reduce((n, v) => n + v, 0);
    const done = bank.parts.reduce((n, [k]) => n + (banked[sk][k] || 0), 0);
    const remaining = Math.max(0, target - done);
    const logged = Math.max(0, done - credited);
    const asked = Math.max(0, target - credited) / planLength;
    const perDay = pace[sk] || 0;
    return {
      skill: sk,
      label: bank.label,
      abbr: bank.abbr,
      unit: bank.unit,
      color: bank.color,
      remaining,
      perDay,
      asked,
      needed: daysLeft > 0 ? remaining / daysLeft : remaining,
      behindBy: Math.max(0, Math.round(asked * elapsed - logged)),
      shortfall: Math.max(0, Math.round(remaining - perDay * daysLeft)),
      ifMissed: (n: number) => (daysLeft - n >= 1 ? remaining / (daysLeft - n) : null),
    };
  });

  const live = skills.filter((s) => s.remaining > 0);
  const atRisk = live.filter((s) => s.shortfall > 0);

  return {
    elapsed,
    studied,
    missed: elapsed - studied,
    skills,
    live,
    behind: skills.filter((s) => s.behindBy > 0),
    atRisk,
    verdict: !live.length ? "clear"
      : !atRisk.length ? "ok"
      : atRisk.length === live.length ? "off"
      : "slipping",
  };
}

/** "125 questions and 35 sujets", the make-up work in its own units. */
export function makeUpPhrase(p: Projection): string {
  const byUnit: Record<string, number> = {};
  p.behind.forEach((s) => (byUnit[s.unit] = (byUnit[s.unit] || 0) + s.behindBy));
  return Object.entries(byUnit)
    .map(([unit, v]) => `${Math.round(v).toLocaleString()} ${unit}`)
    .join(" and ");
}

/** Pace figures read better loose than exact: 13 a day, or 1.6. */
export const perDay = (v: number): string => (v >= 10 ? String(Math.round(v)) : v.toFixed(1));
