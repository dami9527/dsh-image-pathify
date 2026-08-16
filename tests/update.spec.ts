import { describe, expect, it, vi } from "vitest";
import {
  checkPluginUpdate,
  compareVersions,
  upgradeCommand,
} from "../src/update.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("compareVersions", () => {
  it("orders dotted triples and ignores a leading v", () => {
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
    expect(compareVersions("0.1.1", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("v0.1.1", "0.1.1")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
  });
});

describe("upgradeCommand", () => {
  it("copies the official CLI add-latest command for the web profile", () => {
    expect(upgradeCommand("dsh-image-pathify")).toBe(
      "dsh plugin --profile web add dsh-image-pathify@latest",
    );
  });
});

describe("checkPluginUpdate", () => {
  it("flags an update when npm latest is newer", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ "dist-tags": { latest: "0.1.1" } }),
    );
    await expect(
      checkPluginUpdate({
        fetchImpl,
        installedVersion: "0.1.0",
        packageName: "dsh-image-pathify",
      }),
    ).resolves.toEqual({
      installedVersion: "0.1.0",
      latestVersion: "0.1.1",
      updateAvailable: true,
      command: "dsh plugin --profile web add dsh-image-pathify@latest",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not flag an update when already on latest", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ "dist-tags": { latest: "0.1.1" } }),
    );
    const status = await checkPluginUpdate({
      fetchImpl,
      installedVersion: "0.1.1",
      packageName: "dsh-image-pathify",
    });
    expect(status.updateAvailable).toBe(false);
    expect(status.latestVersion).toBe("0.1.1");
  });

  it("falls back to npmjs when npmmirror fails", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("npmmirror")) {
        throw new Error("blocked");
      }
      return jsonResponse({ "dist-tags": { latest: "0.2.0" } });
    });
    const status = await checkPluginUpdate({
      fetchImpl: fetchImpl as typeof fetch,
      installedVersion: "0.1.0",
      packageName: "dsh-image-pathify",
    });
    expect(status).toMatchObject({
      latestVersion: "0.2.0",
      updateAvailable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats a total registry failure as no update", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const status = await checkPluginUpdate({
      fetchImpl,
      installedVersion: "0.1.0",
      packageName: "dsh-image-pathify",
    });
    expect(status.updateAvailable).toBe(false);
    expect(status.installedVersion).toBe("0.1.0");
    expect(status.latestVersion).toBe("0.1.0");
  });
});
