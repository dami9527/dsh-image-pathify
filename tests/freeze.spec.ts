import { describe, expect, it } from "vitest";
import { deepFreeze } from "../src/freeze.ts";

describe("deepFreeze", () => {
  it("freezes nested structure in place and returns the same reference", () => {
    const value = { a: { b: [1, { c: "x" }] } };
    const frozen = deepFreeze(value);
    expect(frozen).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(() => {
      (value.a.b[1] as { c: string }).c = "y";
    }).toThrow(TypeError);
  });

  it("never freezes an AbortSignal: the live cancellation channel keeps working", () => {
    const controller = new AbortController();
    const request = deepFreeze({ model: "m", signal: controller.signal });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(controller.signal)).toBe(false);
    let fired = false;
    controller.signal.addEventListener(
      "abort",
      () => {
        fired = true;
      },
      { once: true },
    );
    controller.abort("stop");
    expect(fired).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it("passes primitives through and terminates on cycles", () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze(null)).toBeNull();
    const cyclic = { self: undefined as unknown };
    cyclic.self = cyclic;
    deepFreeze(cyclic);
    expect(Object.isFrozen(cyclic)).toBe(true);
  });

  it("freezes nesting deeper than a recursive walk would allow", () => {
    const depth = 5_000;
    const root: unknown[] = [];
    let cursor = root;
    for (let index = 0; index < depth; index += 1) {
      const child: unknown[] = [];
      cursor.push(child);
      cursor = child;
    }

    deepFreeze(root);

    cursor = root;
    for (let index = 0; index < depth; index += 1) {
      expect(Object.isFrozen(cursor)).toBe(true);
      cursor = cursor[0] as unknown[];
    }
    expect(Object.isFrozen(cursor)).toBe(true);
  });
});
