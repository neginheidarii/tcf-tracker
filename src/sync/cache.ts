import type { Snapshot } from "../domain/types";
import type { Mutation } from "../state/ops";

/* What the device keeps so the app opens instantly, and works with no
   connection at all. Small enough for localStorage: a year of study is a few
   hundred kilobytes. Everything goes through this interface, so swapping in
   IndexedDB later touches only this file. */

const VERSION = 1;

export interface Cached {
  version: number;
  snapshot: Snapshot | null;
  /** Writes made while offline, waiting their turn. */
  queue: Mutation[];
  pulledAt: string | null;
}

const empty: Cached = { version: VERSION, snapshot: null, queue: [], pulledAt: null };

const keyFor = (userId: string) => `tcf:cache:${userId}`;

export function readCache(userId: string): Cached {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Cached;
    if (parsed.version !== VERSION) return empty;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function writeCache(userId: string, cached: Cached): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ ...cached, version: VERSION }));
  } catch (err) {
    /* A full or blocked store must not take the app down; the server copy is
       still authoritative and the queue is retried in memory. */
    console.warn("could not write the local cache", err);
  }
}

export function clearCache(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* nothing useful to do */
  }
}
