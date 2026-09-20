import { today } from "../domain/dates";
import { toDay, toPlan, toTask, type DayRow, type PlanRow, type TaskRow } from "../lib/rows";
import type { Db } from "../lib/supabase";
import type { Snapshot } from "../domain/types";
import { alignFreshPlan } from "../state/actions";
import { applyOps, pendingTaskIds, queueTouchesPlan, type Mutation, type Op } from "../state/ops";
import { readCache, writeCache, type Cached } from "./cache";
import { RemoteError, pullSnapshot, pushOp } from "./remote";

/* The store the whole app reads from.
 *
 * Reads are always local: the cached snapshot is the source of truth on screen,
 * so the app opens and responds with no connection. Writes are applied to that
 * snapshot at once and appended to a queue, which drains to Postgres in order
 * whenever there is a network. Other devices arrive through realtime.
 *
 * Conflicts settle as last write wins per row. Since a task is its own row,
 * two devices working on different tasks never contend; the same human on two
 * devices editing the same task in the same minute is the case that loses an
 * edit, and that is an acceptable trade for the simplicity.
 */

export type SyncStatus = "loading" | "synced" | "saving" | "offline" | "error";

export interface StoreState {
  snapshot: Snapshot | null;
  status: SyncStatus;
  /** Writes not yet acknowledged by the server. */
  pending: number;
  lastError: string | null;
}

const MAX_TRIES = 5;

export class SyncStore {
  private state: StoreState = { snapshot: null, status: "loading", pending: 0, lastError: null };
  private queue: Mutation[] = [];
  private pulledAt: string | null = null;
  private listeners = new Set<() => void>();
  private channel: ReturnType<Db["channel"]> | null = null;
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private readonly db: Db;
  private readonly userId: string;

  constructor(db: Db, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  /* ------------------------------------------------ external store plumbing */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Returns the same object until something actually changes, which is what
   *  useSyncExternalStore requires to avoid re-rendering forever. */
  getSnapshot = (): StoreState => this.state;

  private set(patch: Partial<StoreState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* ------------------------------------------------ lifecycle */

  async start(): Promise<void> {
    /* React mounts effects twice in development, so starting again after a stop
       has to work rather than leave the store inert. */
    this.stopped = false;
    const cached = readCache(this.userId);
    this.queue = cached.queue;
    this.pulledAt = cached.pulledAt;
    if (cached.snapshot) {
      this.set({ snapshot: cached.snapshot, status: this.queue.length ? "saving" : "synced", pending: this.queue.length });
    }

    window.addEventListener("online", this.onOnline);
    this.watchRealtime();
    await this.refresh();
    void this.flush();
  }

  /** Listeners are left alone: React owns those through subscribe(). */
  stop(): void {
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.channel) void this.db.removeChannel(this.channel);
    this.channel = null;
  }

  private onOnline = (): void => {
    void this.refresh();
    void this.flush();
  };

  /* ------------------------------------------------ reading */

  /** Fetch the server's copy. Local queued writes are replayed on top so an
   *  unsaved change never appears to vanish mid-edit. */
  refresh = async (): Promise<void> => {
    try {
      const remote = await pullSnapshot(this.db, this.userId);
      if (this.stopped || !remote) return;
      const now = new Date().toISOString();
      const merged = this.queue.reduce((s, m) => applyOps(s, m.ops, now), remote);
      this.pulledAt = now;
      this.set({
        snapshot: merged,
        status: this.queue.length ? "saving" : "synced",
        lastError: null,
      });
      this.persist();
      if (!this.queue.length) this.dispatch(alignFreshPlan(merged, today()));
    } catch (err) {
      if (this.stopped) return;
      const offline = err instanceof RemoteError && err.offline;
      /* With a cached snapshot this is a normal offline session, not an error. */
      if (this.state.snapshot) this.set({ status: offline ? "offline" : "error", lastError: offline ? null : message(err) });
      else this.set({ status: offline ? "offline" : "error", lastError: message(err) });
    }
  };

  /* ------------------------------------------------ writing */

  /** Apply a change locally and queue it for the server. */
  dispatch = (ops: Op[]): void => {
    if (!ops.length || !this.state.snapshot) return;
    const now = new Date().toISOString();
    const mutation: Mutation = { id: crypto.randomUUID(), ops, createdAt: now, tries: 0 };
    this.queue = [...this.queue, mutation];
    this.set({
      snapshot: applyOps(this.state.snapshot, ops, now),
      pending: this.queue.length,
      status: "saving",
    });
    this.persist();
    void this.flush();
  };

  private async flush(): Promise<void> {
    if (this.flushing || this.stopped || !this.queue.length) return;
    const planId = this.state.snapshot?.plan.id;
    if (!planId) return;

    this.flushing = true;
    try {
      while (this.queue.length && !this.stopped) {
        const mutation = this.queue[0];
        try {
          for (const op of mutation.ops) {
            await pushOp({ db: this.db, userId: this.userId, planId }, op);
          }
          this.queue = this.queue.slice(1);
          this.set({ pending: this.queue.length, status: this.queue.length ? "saving" : "synced", lastError: null });
          this.persist();
        } catch (err) {
          const offline = err instanceof RemoteError && err.offline;
          if (offline) {
            this.set({ status: "offline" });
            this.scheduleRetry();
            return;
          }
          /* A write the server keeps refusing would block everything behind it,
             so it is dropped after a few tries and reported. */
          mutation.tries += 1;
          if (mutation.tries >= MAX_TRIES) {
            this.queue = this.queue.slice(1);
            this.set({
              pending: this.queue.length,
              status: this.queue.length ? "saving" : "error",
              lastError: `A change could not be saved and was dropped: ${message(err)}`,
            });
            this.persist();
          } else {
            this.set({ status: "error", lastError: message(err) });
            this.scheduleRetry();
            return;
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.stopped) return;
    const tries = this.queue[0]?.tries ?? 0;
    const delay = Math.min(30_000, 2_000 * 2 ** tries);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  /* ------------------------------------------------ realtime */

  private watchRealtime(): void {
    if (this.channel) void this.db.removeChannel(this.channel);
    const filter = `user_id=eq.${this.userId}`;
    this.channel = this.db
      .channel(`tcf:${this.userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, (payload) => {
        this.applyRemoteTask(payload.eventType, payload.new as TaskRow, payload.old as { id?: string });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "days", filter }, (payload) => {
        if (payload.eventType === "DELETE") return;
        this.applyRemoteDay(payload.new as DayRow);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "plans", filter }, (payload) => {
        if (payload.eventType === "DELETE") return;
        this.applyRemotePlan(payload.new as PlanRow);
      })
      .subscribe();
  }

  private applyRemoteTask(event: string, row: TaskRow | null, old: { id?: string } | null): void {
    const snapshot = this.state.snapshot;
    if (!snapshot) return;
    /* Rows we are still trying to save are ours; the server's older copy would
       undo what is on screen. */
    const held = pendingTaskIds(this.queue);

    if (event === "DELETE") {
      const id = old?.id;
      if (!id || held.has(id) || !snapshot.tasks[id]) return;
      const tasks = { ...snapshot.tasks };
      delete tasks[id];
      this.set({ snapshot: { ...snapshot, tasks } });
      this.persist();
      return;
    }

    if (!row || held.has(row.id)) return;
    const task = toTask(row);
    if (snapshot.tasks[task.id]?.updatedAt === task.updatedAt) return;
    this.set({ snapshot: { ...snapshot, tasks: { ...snapshot.tasks, [task.id]: task } } });
    this.persist();
  }

  private applyRemoteDay(row: DayRow | null): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || !row) return;
    const day = toDay(row);
    if (snapshot.days[day.date]?.updatedAt === day.updatedAt) return;
    this.set({ snapshot: { ...snapshot, days: { ...snapshot.days, [day.date]: day } } });
    this.persist();
  }

  private applyRemotePlan(row: PlanRow | null): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || !row) return;
    if (queueTouchesPlan(this.queue)) return;
    const plan = toPlan(row);
    if (plan.updatedAt === snapshot.plan.updatedAt) return;
    this.set({ snapshot: { ...snapshot, plan } });
    this.persist();
  }

  /* ------------------------------------------------ persistence */

  private persist(): void {
    const cached: Cached = {
      version: 1,
      snapshot: this.state.snapshot,
      queue: this.queue,
      pulledAt: this.pulledAt,
    };
    writeCache(this.userId, cached);
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
