import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  checkPluginUpdate,
  compareVersions,
  profileNameFromBaseUrl,
  resolvePluginProfile,
  upgradeCommand,
} from "../src/update.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function profileDirUrl(name: string): string {
  return `${pathToFileURL(join("/tmp/dsh-home/profiles", name)).href}/`;
}

describe("compareVersions", () => {
  it("orders dotted triples and ignores a leading v", () => {
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
    expect(compareVersions("0.1.1", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("v0.1.1", "0.1.1")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
  });
});

describe("profileNameFromBaseUrl", () => {
  it("reads the profiles/<name> directory from a Loader file URL", () => {
    expect(profileNameFromBaseUrl(profileDirUrl("mybot"))).toBe("mybot");
    expect(profileNameFromBaseUrl(profileDirUrl("工作 profile"))).toBe(
      "工作 profile",
    );
  });

  it("ignores URLs that are not a profiles/<name> directory", () => {
    expect(
      profileNameFromBaseUrl(`${pathToFileURL("/tmp/other/mybot").href}/`),
    ).toBeUndefined();
    expect(
      profileNameFromBaseUrl(profileDirUrl("node_modules")),
    ).toBeUndefined();
    expect(profileNameFromBaseUrl("https://example.com/profiles/web/")).toBe(
      undefined,
    );
  });
});

describe("resolvePluginProfile", () => {
  it("defaults to web when Desktop services and baseUrl are absent", () => {
    expect(resolvePluginProfile(undefined)).toBe("web");
  });

  it("uses desktopProfiles.current.name when the service is present", () => {
    expect(
      resolvePluginProfile({ current: { name: "desktop", dir: "/tmp/p" } }),
    ).toBe("desktop");
    expect(resolvePluginProfile({ current: { name: "custom" } })).toBe(
      "custom",
    );
  });

  it("falls back to Loader baseUrl when Desktop is absent", () => {
    expect(resolvePluginProfile(undefined, profileDirUrl("mybot"))).toBe(
      "mybot",
    );
  });

  it("prefers desktopProfiles over Loader baseUrl", () => {
    expect(
      resolvePluginProfile(
        { current: { name: "desktop" } },
        profileDirUrl("mybot"),
      ),
    ).toBe("desktop");
  });
});

describe("upgradeCommand", () => {
  it("copies the official CLI add command pinned to the probed version", () => {
    expect(upgradeCommand("dsh-image-pathify", "0.1.2")).toBe(
      "dsh plugin --profile web add dsh-image-pathify@0.1.2",
    );
    expect(upgradeCommand("dsh-image-pathify", "0.1.2", "desktop")).toBe(
      "dsh plugin --profile desktop add dsh-image-pathify@0.1.2",
    );
    expect(upgradeCommand("dsh-image-pathify", "0.1.2", "工作 profile")).toBe(
      'dsh plugin --profile "工作 profile" add dsh-image-pathify@0.1.2',
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
      command: "dsh plugin --profile web add dsh-image-pathify@0.1.1",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("pins the copied command to the supplied profile", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ "dist-tags": { latest: "0.1.1" } }),
    );
    await expect(
      checkPluginUpdate({
        fetchImpl,
        installedVersion: "0.1.0",
        packageName: "dsh-image-pathify",
        profile: "desktop",
      }),
    ).resolves.toMatchObject({
      updateAvailable: true,
      command: "dsh plugin --profile desktop add dsh-image-pathify@0.1.1",
    });
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
      command: "dsh plugin --profile web add dsh-image-pathify@0.2.0",
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
