import { describe, expect, it } from "vitest";
import { Config } from "../src/config.ts";

const WRITE = Symbol.for("cosmokit.volatile.write");

describe("Config volatile refs", () => {
  it("exposes saved field values through the standard validator", () => {
    const face = (
      Config as unknown as {
        "~standard": {
          validate(value: unknown): {
            value: Record<string, { get(): unknown }>;
          };
        };
      }
    )["~standard"];
    const first = face.validate({ maxTokens: 2048, disableThinking: true });
    const second = face.validate({ maxTokens: 2047, disableThinking: false });
    expect(WRITE in first.value.maxTokens).toBe(true);
    expect(first.value.maxTokens.get()).toBe(2048);
    expect(second.value.maxTokens.get()).toBe(2047);
    expect(second.value.disableThinking.get()).toBe(false);
  });
});
