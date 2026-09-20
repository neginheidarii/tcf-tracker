import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../lib/supabase";
import { makePlan, makeSnapshot, makeTask } from "../test/factory";
import { readCache } from "./cache";
import { RemoteError } from "./remote";
import { SyncStore } from "./store";

/* The offline promises the app makes: a change shows at once, survives a
   reload, and reaches the server when the network comes back. */

const USER = "user-1";
const snapshot = makeSnapshot({ plan: { id: "plan-1" }, tasks: [makeTask({ id: "task-1" })] });

const pull = vi.fn();
const push = vi.fn();

vi.mock("./remote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./remote")>();
  return {
    ...actual,
    pullSnapshot: (...args: unknown[]) => pull(...args),
    pushOp: (...args: unknown[]) => push(...args),
  };
});

/** Enough of a Supabase client for the store: it only subscribes to a channel. */
const fakeDb = (): Db => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
  } as unknown as Db;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

let store: SyncStore;

beforeEach(() => {
  localStorage.clear();
  pull.mockReset().mockResolvedValue(structuredClone(snapshot));
  push.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  store?.stop();
  vi.useRealTimers();
});

describe("reading", () => {
  it("serves the cached copy before the network answers", async () => {
    let release: () => void = () => {};
    pull.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve(structuredClone(snapshot));
    }));
    localStorage.setItem(
      `tcf:cache:${USER}`,
      JSON.stringify({ version: 1, snapshot, queue: [], pulledAt: null }),
    );

    store = new SyncStore(fakeDb(), USER);
    const started = store.start();
    await flush();

    expect(store.getSnapshot().snapshot?.tasks["task-1"]).toBeDefined();
    release();
    await started;
  });

  it("reports offline rather than an error when there is a cached copy", async () => {
    localStorage.setItem(
      `tcf:cache:${USER}`,
      JSON.stringify({ version: 1, snapshot, queue: [], pulledAt: null }),
    );
    pull.mockRejectedValue(new RemoteError("fetch failed", true));

    store = new SyncStore(fakeDb(), USER);
    await store.start();

    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getSnapshot().lastError).toBeNull();
    expect(store.getSnapshot().snapshot).not.toBeNull();
  });
});

describe("writing", () => {
  it("shows a change immediately and then sends it", async () => {
    store = new SyncStore(fakeDb(), USER);
    await store.start();

    store.dispatch([{ t: "task.patch", id: "task-1", patch: { actual: 5, status: "partial" } }]);
    expect(store.getSnapshot().snapshot?.tasks["task-1"].actual).toBe(5);
    expect(store.getSnapshot().pending).toBe(1);

    await flush();
    expect(push).toHaveBeenCalledOnce();
    expect(store.getSnapshot().pending).toBe(0);
    expect(store.getSnapshot().status).toBe("synced");
  });

  it("keeps offline writes in the queue, on disk, and replays them in order", async () => {
    push.mockRejectedValue(new RemoteError("fetch failed", true));
    store = new SyncStore(fakeDb(), USER);
    await store.start();

    store.dispatch([{ t: "task.patch", id: "task-1", patch: { actual: 1 } }]);
    store.dispatch([{ t: "task.patch", id: "task-1", patch: { actual: 2 } }]);
    await flush();

    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getSnapshot().pending).toBe(2);
    /* a reload would find both waiting */
    expect(readCache(USER).queue).toHaveLength(2);
    /* and the change is still on screen */
    expect(store.getSnapshot().snapshot?.tasks["task-1"].actual).toBe(2);

    push.mockReset().mockResolvedValue(undefined);
    window.dispatchEvent(new Event("online"));
    await flush();
    await flush();

    expect(push.mock.calls.map((c) => (c[1] as { patch: { actual: number } }).patch.actual)).toEqual([1, 2]);
    expect(store.getSnapshot().pending).toBe(0);
  });

  it("replays queued writes on top of a fresh pull, so an unsaved edit is not lost", async () => {
    push.mockRejectedValue(new RemoteError("fetch failed", true));
    store = new SyncStore(fakeDb(), USER);
    await store.start();
    store.dispatch([{ t: "task.patch", id: "task-1", patch: { actual: 7 } }]);
    await flush();

    /* the server still has the old value */
    pull.mockResolvedValue(structuredClone(snapshot));
    await store.refresh();

    expect(store.getSnapshot().snapshot?.tasks["task-1"].actual).toBe(7);
  });

  it("gives up on a write the server keeps refusing, and says so", async () => {
    push.mockRejectedValue(new RemoteError("violates check constraint", false));
    store = new SyncStore(fakeDb(), USER);
    await store.start();

    store.dispatch([{ t: "task.patch", id: "task-1", patch: { actual: -1 } }]);
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(31_000);
    }

    expect(store.getSnapshot().pending).toBe(0);
    expect(store.getSnapshot().lastError).toMatch(/could not be saved/);
  });
});

describe("a plan the server has not created yet", () => {
  it("waits rather than inventing one locally", async () => {
    pull.mockResolvedValue(null);
    store = new SyncStore(fakeDb(), USER);
    await store.start();

    expect(store.getSnapshot().snapshot).toBeNull();
  });
});

describe("the cache", () => {
  it("ignores a copy written by an older version", () => {
    localStorage.setItem(
      `tcf:cache:${USER}`,
      JSON.stringify({ version: 0, snapshot: makeSnapshot({ plan: makePlan() }), queue: [] }),
    );
    expect(readCache(USER).snapshot).toBeNull();
  });

  it("ignores unreadable contents", () => {
    localStorage.setItem(`tcf:cache:${USER}`, "{not json");
    expect(readCache(USER).snapshot).toBeNull();
  });
});
