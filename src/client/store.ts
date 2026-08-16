/**
 * Snapshot store for the plugin card: getSnapshot/subscribe/set.
 * Avoids importing the client-runtime store engine (external at bundle time,
 * but tests stub the same shape).
 */

/** Minimal observable used as a slot `hooks.*` snapshot. */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(fn: () => void): () => void;
  set(value: T): void;
}

/** Create a tiny in-memory snapshot store. */
export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    set: (value) => {
      snapshot = value;
      for (const listener of listeners) listener();
    },
  };
}
