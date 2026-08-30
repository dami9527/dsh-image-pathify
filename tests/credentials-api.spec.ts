/**
 * Dual credentials wire: 0.1.2 Remote namespace vs older Connection RPC bag.
 */
import { describe, expect, it, vi } from "vitest";
import {
  credentialsFace,
  resolveCredentialsSource,
} from "../src/client/credentials-api.ts";

const REF = "IMAGE_PATHIFY_API_KEY";

describe("resolveCredentialsSource", () => {
  it("prefers remote.credentials over connection.api", () => {
    const remoteDescribe = vi.fn();
    const legacyDescribe = vi.fn();
    const source = resolveCredentialsSource({
      get(name) {
        if (name === "remote.credentials") {
          return { describe: remoteDescribe, set: vi.fn() };
        }
        if (name === "connection") {
          return {
            api: { credentials: { describe: legacyDescribe, set: vi.fn() } },
          };
        }
        return undefined;
      },
    });
    expect(source?.kind).toBe("remote");
    expect(source && "api" in source ? source.api.describe : undefined).toBe(
      remoteDescribe,
    );
  });

  it("falls back to connection.api.credentials on older hosts", () => {
    const describe = vi.fn();
    const source = resolveCredentialsSource({
      get(name) {
        if (name === "connection") {
          return { api: { credentials: { describe, set: vi.fn() } } };
        }
        return undefined;
      },
    });
    expect(source?.kind).toBe("legacy");
  });

  it("does not throw when 0.1.2 connection has no api", () => {
    expect(
      resolveCredentialsSource({
        get(name) {
          if (name === "connection") return { state: "connected" };
          return undefined;
        },
      }),
    ).toBeUndefined();
  });
});

describe("credentialsFace", () => {
  it("calls the 0.1.2 Remote describe([ref]) / set(ref, value) shape", async () => {
    const describe = vi.fn(async (refs: string[]) => ({
      ok: true as const,
      value: { [refs[0] ?? ""]: { configured: true, writable: true } },
    }));
    const set = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const face = credentialsFace({
      kind: "remote",
      api: { describe, set },
    });
    await expect(face.describe(REF)).resolves.toEqual({
      configured: true,
      writable: true,
    });
    expect(describe).toHaveBeenCalledWith([REF]);
    await face.set(REF, "sk-test");
    expect(set).toHaveBeenCalledWith(REF, "sk-test");
  });

  it("calls the older Connection RPC describe({ refs }) / set({ ref, value }) shape", async () => {
    const describe = vi.fn(async () => ({
      result: {
        ok: true as const,
        value: { credentials: { [REF]: { configured: true, writable: true } } },
      },
    }));
    const set = vi.fn(async () => ({
      result: { ok: true as const, value: {} },
    }));
    const face = credentialsFace({
      kind: "legacy",
      api: { describe, set },
    });
    await expect(face.describe(REF)).resolves.toEqual({
      configured: true,
      writable: true,
    });
    expect(describe).toHaveBeenCalledWith({ refs: [REF] });
    await face.set(REF, "sk-test");
    expect(set).toHaveBeenCalledWith({ ref: REF, value: "sk-test" });
  });

  it("describe stays idle when no source is mounted", async () => {
    await expect(credentialsFace(undefined).describe(REF)).resolves.toEqual({
      configured: false,
      writable: true,
    });
  });
});
