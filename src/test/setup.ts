import "@testing-library/jest-dom/vitest";

/* Node 25 exposes an experimental `localStorage` global that, without a backing
   file, arrives as an empty object and shadows the one jsdom would provide. The
   app uses plain `localStorage` as it does in a browser, so tests get a small
   working implementation instead. */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

if (typeof localStorage?.clear !== "function") {
  const storage = new MemoryStorage();
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}
