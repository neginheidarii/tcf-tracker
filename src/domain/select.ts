import { BANKS, SKILLS } from "./banks";
import { addDays, daysBetween } from "./dates";
import { projection, type Projection } from "./projection";
import { levelsFrom } from "./templates";
import type { Day, Plan, Skill, Snapshot, Task } from "./types";

/* Everything the screens read is worked out here, from the snapshot alone. No
   state is stored twice: progress, pace and drift are all derived. */

export type TasksByDate = Map<string, Task[]>;

/** Tasks grouped by day and put in clock order, built once per render. */
export function indexTasks(snapshot: Snapshot): TasksByDate {
  const byDate: TasksByDate = new Map();
  for (const task of Object.values(snapshot.tasks)) {
    const list = byDate.get(task.date);
    if (list) list.push(task);
    else byDate.set(task.date, [task]);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.at || "12:00").localeCompare(b.at || "12:00") || a.sortOrder - b.sortOrder);
  }
  return byDate;
}

/** Baseline credit plus everything logged against each slice of each bank. */
export function bankedFrom(snapshot: Snapshot): Record<Skill, Record<string, number>> {
  const banked = {} as Record<Skill, Record<string, number>>;
  SKILLS.forEach((sk) => (banked[sk] = { ...snapshot.plan.baselines[sk] }));
  for (const t of Object.values(snapshot.tasks)) {
    if (t.bank && t.actual > 0 && banked[t.bank.skill]) {
      banked[t.bank.skill][t.bank.key] = (banked[t.bank.skill][t.bank.key] || 0) + t.actual;
    }
  }
  return banked;
}

/** Average logged per day over the trailing fortnight. */
export function paceFrom(snapshot: Snapshot, today: string, todayIndex: number): Record<Skill, number> {
  const from = addDays(today, -13);
  const total = {} as Record<Skill, number>;
  SKILLS.forEach((sk) => (total[sk] = 0));
  for (const t of Object.values(snapshot.tasks)) {
    if (!t.bank || t.actual <= 0) continue;
    if (t.date < from || t.date > today) continue;
    total[t.bank.skill] += t.actual;
  }
  const elapsed = Math.max(1, Math.min(14, todayIndex));
  SKILLS.forEach((sk) => (total[sk] = total[sk] / elapsed));
  return total;
}

/** Consecutive days with something touched, counting back from today. An
 *  untouched today doesn't break a streak that is otherwise running. */
export function streakFrom(byDate: TasksByDate, today: string): number {
  const touched = (date: string) => (byDate.get(date) ?? []).some((t) => t.status !== "pending");
  let streak = 0;
  let cursor = today;
  if (!touched(cursor)) cursor = addDays(cursor, -1);
  while (touched(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface Derived {
  plan: Plan;
  today: string;
  cursor: string;
  dayIndex: number;
  todayIndex: number;
  planLength: number;
  toExam: number;
  daysLeft: number;
  inRange: boolean;
  badRange: boolean;
  day: Day | undefined;
  tasks: Task[];
  byDate: TasksByDate;
  banked: Record<Skill, Record<string, number>>;
  pace: Record<Skill, number>;
  levels: Record<"CO" | "CE", string>;
  streak: number;
  outlook: Projection;
}

export function derive(snapshot: Snapshot, today: string, cursor: string): Derived {
  const { plan } = snapshot;
  const byDate = indexTasks(snapshot);
  const dayIndex = daysBetween(plan.startDate, cursor) + 1;
  const todayIndex = daysBetween(plan.startDate, today) + 1;
  const toExam = daysBetween(today, plan.examDate);
  const planLength = Math.max(1, daysBetween(plan.startDate, plan.examDate) + 1);
  const daysLeft = Math.max(0, toExam);
  const banked = bankedFrom(snapshot);
  const pace = paceFrom(snapshot, today, todayIndex);

  return {
    plan,
    today,
    cursor,
    dayIndex,
    todayIndex,
    planLength,
    toExam,
    daysLeft,
    inRange: dayIndex >= 1 && dayIndex <= planLength,
    badRange: daysBetween(plan.startDate, plan.examDate) < 0,
    day: snapshot.days[cursor],
    tasks: byDate.get(cursor) ?? [],
    byDate,
    banked,
    pace,
    levels: levelsFrom(banked),
    streak: streakFrom(byDate, today),
    outlook: projection(snapshot.plan, { todayIndex, planLength, daysLeft, banked, pace, byDate }),
  };
}

/** How one cell of the day strip should read. */
export type CellState = "future" | "full" | "part" | "miss";

export function cellState(tasks: Task[] | undefined, dayNumber: number, todayIndex: number): CellState {
  if (tasks && tasks.length) {
    if (tasks.every((t) => t.status !== "pending")) return "full";
    if (tasks.some((t) => t.status === "done")) return "part";
  }
  return dayNumber < todayIndex ? "miss" : "future";
}

/** Consecutive tasks in the same block, for the grouped day view. */
export function groupByBlock(tasks: Task[]): { block: Task["block"]; at: string; items: Task[] }[] {
  const groups: { block: Task["block"]; at: string; items: Task[] }[] = [];
  for (const t of tasks) {
    const last = groups[groups.length - 1];
    if (last && last.block === t.block) last.items.push(t);
    else groups.push({ block: t.block, at: t.at, items: [t] });
  }
  return groups;
}

export function bankProgress(
  skill: Skill,
  banked: Record<Skill, Record<string, number>>,
  target: number,
) {
  const done = BANKS[skill].parts.reduce((n, [k]) => n + (banked[skill][k] || 0), 0);
  return { done, remaining: Math.max(0, target - done), pct: Math.min(100, Math.round((done / target) * 100)) };
}
