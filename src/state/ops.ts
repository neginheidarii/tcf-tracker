import type { Plan, Snapshot, Task, TemplateKind } from "../domain/types";

/* Every change is expressed as one or more small operations. Each maps onto a
   single row write in Postgres, which is what makes offline queueing and
   syncing two devices tractable: the unit of conflict is a row, not the day. */

export type PlanPatch = Partial<
  Pick<Plan, "startDate" | "examDate" | "theme" | "targets" | "baselines" | "templates">
>;

export type TaskPatch = Partial<Omit<Task, "id" | "date" | "updatedAt">>;

export type Op =
  | { t: "plan.patch"; patch: PlanPatch }
  | { t: "day.upsert"; date: string; templateKind: TemplateKind | null }
  | { t: "task.upsert"; task: Task }
  | { t: "task.patch"; id: string; patch: TaskPatch }
  | { t: "task.delete"; id: string };

/** A queued batch. Batches are applied whole so a day never lands half-built. */
export interface Mutation {
  id: string;
  ops: Op[];
  createdAt: string;
  /** Attempts made against the server, used to back off and eventually give up. */
  tries: number;
}

export function applyOp(snapshot: Snapshot, op: Op, now: string): Snapshot {
  switch (op.t) {
    case "plan.patch":
      return { ...snapshot, plan: { ...snapshot.plan, ...op.patch, updatedAt: now } };

    case "day.upsert":
      return {
        ...snapshot,
        days: { ...snapshot.days, [op.date]: { date: op.date, templateKind: op.templateKind, updatedAt: now } },
      };

    case "task.upsert":
      return {
        ...snapshot,
        tasks: { ...snapshot.tasks, [op.task.id]: { ...op.task, updatedAt: now } },
      };

    case "task.patch": {
      const current = snapshot.tasks[op.id];
      if (!current) return snapshot;
      return {
        ...snapshot,
        tasks: { ...snapshot.tasks, [op.id]: { ...current, ...op.patch, updatedAt: now } },
      };
    }

    case "task.delete": {
      if (!snapshot.tasks[op.id]) return snapshot;
      const tasks = { ...snapshot.tasks };
      delete tasks[op.id];
      return { ...snapshot, tasks };
    }
  }
}

export const applyOps = (snapshot: Snapshot, ops: Op[], now: string): Snapshot =>
  ops.reduce((s, op) => applyOp(s, op, now), snapshot);

/** Rows the queue is still holding, so realtime updates for them can be
 *  ignored until our own write lands. */
export function pendingTaskIds(queue: Mutation[]): Set<string> {
  const ids = new Set<string>();
  for (const m of queue) {
    for (const op of m.ops) {
      if (op.t === "task.upsert") ids.add(op.task.id);
      else if (op.t === "task.patch" || op.t === "task.delete") ids.add(op.id);
    }
  }
  return ids;
}

export const queueTouchesPlan = (queue: Mutation[]): boolean =>
  queue.some((m) => m.ops.some((op) => op.t === "plan.patch"));
