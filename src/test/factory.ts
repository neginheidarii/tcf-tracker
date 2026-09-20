import { DEFAULT_BASELINES, DEFAULT_TARGETS } from "../domain/banks";
import { addDays } from "../domain/dates";
import type { Day, Plan, Snapshot, Task } from "../domain/types";

/* Builders for tests, so each one only states what it actually cares about. */

let counter = 0;
export const testId = (prefix = "id"): string => `${prefix}-${++counter}`;

export function makePlan(over: Partial<Plan> = {}): Plan {
  const startDate = over.startDate ?? "2026-01-01";
  return {
    id: "plan-1",
    startDate,
    examDate: over.examDate ?? addDays(startDate, 74),
    theme: "light",
    targets: { ...DEFAULT_TARGETS },
    baselines: structuredClone(DEFAULT_BASELINES),
    templates: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: testId("task"),
    date: "2026-01-01",
    tid: null,
    block: "study1",
    at: "18:30",
    kind: "CO",
    title: "Compréhension orale — B1",
    target: 9,
    actual: 0,
    spent: 0,
    unit: "questions",
    mins: 25,
    bank: { skill: "CO", key: "B1" },
    status: "pending",
    fromTemplate: null,
    rolledFrom: 0,
    sortOrder: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeDay(over: Partial<Day> = {}): Day {
  return {
    date: "2026-01-01",
    templateKind: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeSnapshot(
  { plan, days = [], tasks = [] }: { plan?: Partial<Plan>; days?: Day[]; tasks?: Task[] } = {},
): Snapshot {
  return {
    plan: makePlan(plan),
    days: Object.fromEntries(days.map((d) => [d.date, d])),
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
  };
}
