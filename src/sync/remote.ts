import { fromPlanPatch, fromTask, fromTaskPatch, snapshotFrom } from "../lib/rows";
import type { Db } from "../lib/supabase";
import type { Snapshot } from "../domain/types";
import type { Op } from "../state/ops";

/* The only place that talks to Postgres. Each operation is one row write, so a
   queued batch replays as the same writes in the same order. */

export class RemoteError extends Error {
  /** True when the request never reached the server, so retrying makes sense. */
  readonly offline: boolean;

  constructor(message: string, offline: boolean) {
    super(message);
    this.name = "RemoteError";
    this.offline = offline;
  }
}

/* A request that never reached the server is worth retrying; one the server
   refused is not. The distinction is awkward because supabase-js reports a
   failed fetch as an error object rather than throwing, so a transport failure
   and a rejected write arrive by the same route. */
function looksOffline(message: string, code?: string | null): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (/fetch|network|load failed|timeout|connection|ECONN|aborted/i.test(message)) return true;
  /* PostgREST always sends a code with a real reply; its absence means nothing
     came back. */
  return !code;
}

const fromPostgrest = (error: { message: string; code?: string | null }): RemoteError =>
  new RemoteError(error.message, looksOffline(error.message, error.code));

function fromThrown(err: unknown, fallback: string): RemoteError {
  if (err instanceof RemoteError) return err;
  const message = err instanceof Error ? err.message : fallback;
  return new RemoteError(message, looksOffline(message));
}

export interface RemoteContext {
  db: Db;
  userId: string;
  planId: string;
}

/** Everything the account owns. Bounded by the length of a study plan, so a
 *  single read is simpler and cheaper than paging. */
export async function pullSnapshot(db: Db, userId: string): Promise<Snapshot | null> {
  try {
    const plans = await db.from("plans").select("*").eq("user_id", userId).limit(1);
    if (plans.error) throw fromPostgrest(plans.error);
    const plan = plans.data?.[0];
    if (!plan) return null;

    const [days, tasks] = await Promise.all([
      db.from("days").select("*").eq("plan_id", plan.id),
      db.from("tasks").select("*").eq("plan_id", plan.id),
    ]);
    if (days.error) throw fromPostgrest(days.error);
    if (tasks.error) throw fromPostgrest(tasks.error);

    return snapshotFrom(plan, days.data ?? [], tasks.data ?? []);
  } catch (err) {
    throw fromThrown(err, "could not read your plan");
  }
}

export async function pushOp(ctx: RemoteContext, op: Op): Promise<void> {
  const { db, userId, planId } = ctx;
  try {
    switch (op.t) {
      case "plan.patch": {
        const { error } = await db.from("plans").update(fromPlanPatch(op.patch)).eq("id", planId);
        if (error) throw fromPostgrest(error);
        return;
      }
      case "day.upsert": {
        const { error } = await db.from("days").upsert(
          { user_id: userId, plan_id: planId, on_date: op.date, template_kind: op.templateKind },
          { onConflict: "plan_id,on_date" },
        );
        if (error) throw fromPostgrest(error);
        return;
      }
      case "task.upsert": {
        const { error } = await db.from("tasks").upsert(fromTask(op.task, userId, planId));
        if (error) throw fromPostgrest(error);
        return;
      }
      case "task.patch": {
        const columns = fromTaskPatch(op.patch);
        if (!Object.keys(columns).length) return;
        const { error } = await db.from("tasks").update(columns).eq("id", op.id);
        if (error) throw fromPostgrest(error);
        return;
      }
      case "task.delete": {
        const { error } = await db.from("tasks").delete().eq("id", op.id);
        if (error) throw fromPostgrest(error);
        return;
      }
    }
  } catch (err) {
    throw fromThrown(err, "could not save the change");
  }
}
