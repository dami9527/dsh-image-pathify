/**
 * In-place deep freeze owned by this plugin.
 *
 * dsh 0.1.2-alpha.2 moved `deepFreeze` off `@deepseek-ai/dsh-llm` onto
 * `@deepseek-ai/dsh-util-values`. A named import from `dsh-llm` fails to
 * load on alpha.2; importing the new package would drop rc.7–alpha.1.
 * The algorithm is unchanged: iterative walk, cycle-safe, skip AbortSignal
 * so the request's live cancellation channel keeps working.
 * @module dsh-image-pathify/freeze
 */

/**
 * Deep-freeze a value in place. Nested enumerable objects are frozen;
 * primitives pass through; `AbortSignal` is left mutable.
 */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const pending: (
    | { kind: "visit"; node: unknown }
    | { kind: "property"; source: Record<string, unknown>; key: string }
  )[] = [{ kind: "visit", node: value }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined) continue;
    if (task.kind === "property") {
      pending.push({ kind: "visit", node: task.source[task.key] });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      pending.push({
        kind: "property",
        source: node as Record<string, unknown>,
        key,
      });
    }
  }
  return value;
}
