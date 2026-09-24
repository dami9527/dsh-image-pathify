/**
 * Credentials wire: `remote.credentials` describe([ref]) / set(ref, value).
 */
import { describe, expect, it, vi } from "vitest";
import {
  credentialsFace,
  resolveCredentialsApi,
} from "../src/client/credentials-api.ts";

const REF = "IMAGE_PATHIFY_API_KEY";

describe("resolveCredentialsApi", () => {
  it("reads remote.credentials", () => {
    const describe = vi.fn();
    const api = resolveCredentialsApi({
      get(name) {
        if (name === "remote.credentials") {
          return { describe, set: vi.fn() };
        }
        return undefined;
      },
    });
    expect(api?.describe).toBe(describe);
  });

  it("returns undefined when the namespace is absent", () => {
    expect(
      resolveCredentialsApi({
        get() {
          return undefined;
        },
      }),
    ).toBeUndefined();
  });
});

describe("credentialsFace", () => {
  it("calls describe([ref]) and set(ref, value)", async () => {
    const describe = vi.fn(async (refs: string[]) => ({
      ok: true as const,
      value: { [refs[0] ?? ""]: { configured: true, writable: true } },
    }));
    const set = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const face = credentialsFace({ describe, set });
    await expect(face.describe(REF)).resolves.toEqual({
      configured: true,
      writable: true,
    });
    expect(describe).toHaveBeenCalledWith([REF]);
    await face.set(REF, "sk-test");
    expect(set).toHaveBeenCalledWith(REF, "sk-test");
  });

  it("describe stays idle when no source is mounted", async () => {
    await expect(credentialsFace(undefined).describe(REF)).resolves.toEqual({
      configured: false,
      writable: true,
    });
  });
});
