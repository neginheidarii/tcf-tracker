import { BANKS, DEFAULT_BASELINES, DEFAULT_TARGETS, bankTotal, isSkill } from "../domain/banks";
import { addDays, daysBetween } from "../domain/dates";
import { indexTasks } from "../domain/select";
import {
  DEFAULT_TEMPLATES, buildTemplate, isKeeper, levelsFrom, templateTasks,
} from "../domain/templates";
import { bankedFrom } from "../domain/select";
import type {
  Plan, Skill, Snapshot, Task, TaskStatus, TemplateKind, TemplateTask,
} from "../domain/types";
import type { Op } from "./ops";

/* Intents, as pure functions from the current snapshot to a list of operations.
   Nothing here touches the network, React or the clock beyond what is passed
   in, so every rule below is testable on its own. */

export const newId = (): string => crypto.randomUUID();

const statusFor = (actual: number, target: number): TaskStatus =>
  actual >= target ? "done" : actual > 0 ? "partial" : "pending";

export function emptyTask(date: string, sortOrder: number): Task {
  return {
    id: newId(), date, tid: null, block: "evening", at: "19:30", kind: "CO",
    title: "", target: 1, actual: 0, spent: 0, unit: "questions", mins: 20,
    bank: null, status: "pending", fromTemplate: null, rolledFrom: 0,
    sortOrder, updatedAt: new Date().toISOString(),
  };
}

/** Stamp a template onto a date, keeping hand-made and moved-in tasks. */
export function applyTemplate(snapshot: Snapshot, kind: TemplateKind, date: string): Op[] {
  const levels = levelsFrom(bankedFrom(snapshot));
  const fresh = buildTemplate(kind, snapshot.plan, levels, date, newId);
  const existing = indexTasks(snapshot).get(date) ?? [];

  return [
    { t: "day.upsert", date, templateKind: kind },
    ...existing.filter((t) => !isKeeper(t)).map((t): Op => ({ t: "task.delete", id: t.id })),
    ...fresh.map((task): Op => ({ t: "task.upsert", task })),
  ];
}

/** Whether stamping a template would overwrite anything the user would miss. */
export const hasTemplateTasks = (tasks: Task[]): boolean => tasks.some((t) => !isKeeper(t));

export function clearDay(snapshot: Snapshot, date: string): Op[] {
  const existing = indexTasks(snapshot).get(date) ?? [];
  return [
    { t: "day.upsert", date, templateKind: null },
    ...existing.map((t): Op => ({ t: "task.delete", id: t.id })),
  ];
}

/** Outstanding bank work, moved to the next day as standalone tasks so a
 *  template stamped on that day adds to it instead of wiping it. */
export function rollForward(snapshot: Snapshot, date: string): { ops: Op[]; moved: number } {
  const byDate = indexTasks(snapshot);
  const left = (byDate.get(date) ?? []).filter(
    (t) => (t.status === "pending" || t.status === "partial") && t.bank,
  );
  if (!left.length) return { ops: [], moved: 0 };

  const next = addDays(date, 1);
  const base = (byDate.get(next) ?? []).length;
  const ops: Op[] = [{ t: "day.upsert", date: next, templateKind: snapshot.days[next]?.templateKind ?? null }];

  left.forEach((t, i) => {
    ops.push({
      t: "task.upsert",
      task: {
        ...t, id: newId(), date: next, actual: 0, spent: 0, status: "pending",
        rolledFrom: t.rolledFrom + 1, fromTemplate: null, tid: null, sortOrder: base + i,
      },
    });
    ops.push({ t: "task.delete", id: t.id });
  });

  return { ops, moved: left.length };
}

export function toggleDone(task: Task): Op[] {
  const patch = task.status === "done"
    ? { status: "pending" as TaskStatus, actual: 0 }
    : { status: "done" as TaskStatus, actual: task.target };
  return [{ t: "task.patch", id: task.id, patch }];
}

export function bumpActual(task: Task, delta: number): Op[] {
  const actual = Math.max(0, Math.min(task.target, task.actual + delta));
  if (actual === task.actual) return [];
  return [{ t: "task.patch", id: task.id, patch: { actual, status: statusFor(actual, task.target) } }];
}

export const stepFor = (task: Task): number => (task.unit === "questions" ? 5 : 1);

export function toggleSkipped(task: Task): Op[] {
  return [{
    t: "task.patch", id: task.id,
    patch: { status: task.status === "skipped" ? statusFor(task.actual, task.target) : "skipped" },
  }];
}

export const saveTask = (task: Task): Op[] => [{ t: "task.upsert", task }];
export const deleteTask = (id: string): Op[] => [{ t: "task.delete", id }];

export function setDates(patch: { startDate?: string; examDate?: string }): Op[] {
  return [{ t: "plan.patch", patch }];
}

export const setTheme = (theme: Plan["theme"]): Op[] => [{ t: "plan.patch", patch: { theme } }];

export function setTarget(plan: Plan, skill: Skill, value: number): Op[] {
  const clamped = Math.max(1, Math.min(bankTotal(skill), Math.round(value) || 1));
  return [{ t: "plan.patch", patch: { targets: { ...plan.targets, [skill]: clamped } } }];
}

/** The number in the breakdown is the total covered, so what gets stored is
 *  that figure minus whatever tasks already account for. */
export function setBankedTotal(
  snapshot: Snapshot, skill: Skill, key: string, total: number,
): Op[] {
  const cap = BANKS[skill].parts.find(([k]) => k === key)?.[1] ?? 0;
  let fromTasks = 0;
  for (const t of Object.values(snapshot.tasks)) {
    if (t.bank && t.bank.skill === skill && t.bank.key === key) fromTasks += t.actual;
  }
  const clamped = Math.max(0, Math.min(cap, Math.round(total) || 0));
  const baselines = {
    ...snapshot.plan.baselines,
    [skill]: { ...snapshot.plan.baselines[skill], [key]: Math.max(0, clamped - fromTasks) },
  };
  return [{ t: "plan.patch", patch: { baselines } }];
}

/** Save a template, then re-stamp today and every future day using it, keeping
 *  progress already logged against rows that survived the edit. */
export function saveTemplate(
  snapshot: Snapshot, kind: TemplateKind, list: TemplateTask[], today: string,
): Op[] {
  const templates = {
    chill: templateTasks("chill", snapshot.plan),
    productive: templateTasks("productive", snapshot.plan),
    ...snapshot.plan.templates,
    [kind]: list.map((t) => ({ ...t, tid: t.tid || newId() })),
  };
  const nextPlan: Plan = { ...snapshot.plan, templates };
  const ops: Op[] = [{ t: "plan.patch", patch: { templates } }];

  const levels = levelsFrom(bankedFrom(snapshot));
  const byDate = indexTasks(snapshot);

  for (const [date, day] of Object.entries(snapshot.days)) {
    if (date < today || day.templateKind !== kind) continue;
    const existing = byDate.get(date) ?? [];

    for (const t of existing) {
      if (!isKeeper(t)) ops.push({ t: "task.delete", id: t.id });
    }
    for (const task of buildTemplate(kind, nextPlan, levels, date, newId)) {
      /* carry over what was logged against the same template row */
      const prior = existing.find((p) => p.tid && p.tid === task.tid && !isKeeper(p));
      if (!prior) {
        ops.push({ t: "task.upsert", task });
        continue;
      }
      const actual = Math.min(prior.actual, task.target);
      ops.push({
        t: "task.upsert",
        task: {
          ...task, actual, spent: prior.spent,
          status: prior.status === "skipped" ? "skipped" : statusFor(actual, task.target),
        },
      });
    }
  }

  return ops;
}

export const resetTemplate = (kind: TemplateKind): TemplateTask[] =>
  DEFAULT_TEMPLATES[kind].map((t) => ({ ...t }));

/** A task edit can be pushed back into the template it came from. */
export function saveTaskToTemplate(
  snapshot: Snapshot, task: Task, today: string,
): Op[] {
  if (!task.fromTemplate || !task.tid) return [];
  const list = templateTasks(task.fromTemplate, snapshot.plan).map((row) => {
    if (row.tid !== task.tid) return row;
    /* an "auto" level stays automatic unless the skill itself changed */
    const keepAuto = row.bank?.key === "auto" && task.bank?.skill === row.bank.skill;
    return {
      ...row,
      title: task.title, at: task.at, mins: task.mins, target: task.target,
      unit: task.unit, kind: task.kind,
      bank: keepAuto ? row.bank : task.bank,
    };
  });
  return saveTemplate(snapshot, task.fromTemplate, list, today);
}

/** Keeps a task's bank pointer valid when its type changes. */
export function retargetTask(task: Task, kind: Task["kind"]): Task {
  if (!isSkill(kind)) return { ...task, kind, bank: null };
  return {
    ...task, kind,
    bank: { skill: kind, key: task.bank?.skill === kind ? task.bank.key : BANKS[kind].parts[0][0] },
    unit: BANKS[kind].unit,
  };
}

/** A new account's plan is dated by the server, which runs on UTC. While the
 *  plan is still untouched, move it onto the device's own date so "Day 1" is
 *  today wherever you are. */
export function alignFreshPlan(snapshot: Snapshot, today: string): Op[] {
  const untouched = !Object.keys(snapshot.tasks).length && !Object.keys(snapshot.days).length;
  if (!untouched || snapshot.plan.startDate === today) return [];
  const span = Math.max(0, daysBetween(snapshot.plan.startDate, snapshot.plan.examDate));
  return [{ t: "plan.patch", patch: { startDate: today, examDate: addDays(today, span) } }];
}

export function freshPlan(id: string, startDate: string, planDays = 75): Plan {
  return {
    id,
    startDate,
    examDate: addDays(startDate, planDays - 1),
    theme: "light",
    targets: { ...DEFAULT_TARGETS },
    baselines: structuredClone(DEFAULT_BASELINES),
    templates: null,
    updatedAt: new Date().toISOString(),
  };
}

export const emptySnapshot = (plan: Plan): Snapshot => ({ plan, days: {}, tasks: {} });
