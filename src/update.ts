/**
 * Silent npm latest-version probe. Failure is treated as "no update" so the
 * settings card never blocks on the registry.
 * @module dsh-image-pathify/update
 */

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImagePathifyUpdateStatus } from "./contract.ts";

/** npm registries to try, in order (npmmirror first for mainland networks). */
const REGISTRIES = [
  "https://registry.npmmirror.com",
  "https://registry.npmjs.org",
] as const;

/** Per-request timeout for a registry lookup. */
const FETCH_TIMEOUT_MS = 8000;

/** Last-resort default when Desktop and Loader `baseUrl` are both absent. */
export const DEFAULT_PLUGIN_PROFILE = "web";

/** Overrides used by tests; production always reads the installed package. */
export interface CheckUpdateOptions {
  readonly fetchImpl?: typeof fetch;
  readonly installedVersion?: string;
  readonly packageName?: string;
  /** Profile the copied `dsh plugin add` command should target. */
  readonly profile?: string;
}

/** Names the official launcher rejects (`resolveProfileDir`). */
function isUsableProfileName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    name !== "node_modules" &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0")
  );
}

/**
 * Read the profile directory basename from Loader `ctx.baseUrl`.
 *
 * Official boot sets this to `$DSH_HOME/profiles/<name>/` (the `cordis.yml`
 * directory). Nested or unrelated URLs are ignored.
 */
export function profileNameFromBaseUrl(baseUrl: unknown): string | undefined {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) return undefined;
  let dir: string;
  try {
    dir = fileURLToPath(baseUrl);
  } catch {
    return undefined;
  }
  const trimmed = dir.replace(/[\\/]+$/, "");
  if (basename(dirname(trimmed)) !== "profiles") return undefined;
  const name = basename(trimmed);
  return isUsableProfileName(name) ? name : undefined;
}

/** Quote a profile token when it is not a plain identifier. */
function quoteProfileArg(profile: string): string {
  return /^[A-Za-z0-9._-]+$/.test(profile) ? profile : JSON.stringify(profile);
}

/**
 * Pick the profile the copied upgrade command should target.
 *
 * 1. `$DSH_HOME/profiles/<name>` basename from Loader `ctx.baseUrl`
 * 2. {@link DEFAULT_PLUGIN_PROFILE}
 *
 * 0.1.7 and 0.2.1 expose no `desktopProfiles` service, so the old desktop
 * probe is gone rather than reading a service that never exists.
 */
export function resolvePluginProfile(baseUrl?: unknown): string {
  return profileNameFromBaseUrl(baseUrl) ?? DEFAULT_PLUGIN_PROFILE;
}

function readOwnPackage(): { name: string; version: string } {
  const fallback = { name: "dsh-image-pathify", version: "0.0.0" };
  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    return {
      name: typeof pkg.name === "string" ? pkg.name : fallback.name,
      version: typeof pkg.version === "string" ? pkg.version : fallback.version,
    };
  } catch {
    return fallback;
  }
}

/** Build the CLI command the card copies. Pins the probed version, not `@latest`. */
export function upgradeCommand(
  packageName: string,
  version: string,
  profile = DEFAULT_PLUGIN_PROFILE,
): string {
  return `dsh plugin --profile ${quoteProfileArg(profile)} add ${packageName}@${version}`;
}

interface ParsedVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

/**
 * Compare two versions with SemVer prerelease precedence. Build metadata is
 * ignored, so `0.2.2+build` equals `0.2.2`; a release is newer than any of its
 * prereleases (`0.2.2-rc.1` < `0.2.2`).
 * @returns negative when `left` is older than `right`.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i += 1) {
    const av = a.core[i] ?? 0;
    const bv = b.core[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function parseVersion(value: string): ParsedVersion {
  const normalized = value.trim().replace(/^v/i, "").split("+")[0] ?? "";
  const [corePart, ...prereleaseParts] = normalized.split("-");
  const parts = (corePart ?? "0").split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
  return {
    core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    prerelease: prereleaseParts
      .join("-")
      .split(".")
      .filter((part) => part.length > 0),
  };
}

function comparePrerelease(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const av = Number(a);
      const bv = Number(b);
      if (av !== bv) return av < bv ? -1 : 1;
      continue;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

function idleStatus(
  packageName: string,
  installedVersion: string,
  profile: string,
): ImagePathifyUpdateStatus {
  return {
    installedVersion,
    latestVersion: installedVersion,
    updateAvailable: false,
    command: upgradeCommand(packageName, installedVersion, profile),
  };
}

async function fetchNpmLatest(
  packageName: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  for (const base of REGISTRIES) {
    try {
      const response = await fetchImpl(
        `${base}/${encodeURIComponent(packageName)}`,
        {
          headers: { "User-Agent": "dsh-image-pathify" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
      if (!response.ok) continue;
      const body = (await response.json()) as {
        "dist-tags"?: { latest?: unknown };
      };
      const latest = body["dist-tags"]?.latest;
      if (typeof latest === "string" && latest.length > 0) return latest;
    } catch {
      // Try the next registry. Total failure becomes "no update".
    }
  }
  return undefined;
}

/**
 * Compare the installed package version with npm `dist-tags.latest`.
 * Network errors and missing tags resolve to `updateAvailable: false`.
 */
export async function checkPluginUpdate(
  options: CheckUpdateOptions = {},
): Promise<ImagePathifyUpdateStatus> {
  const own = readOwnPackage();
  const packageName = options.packageName ?? own.name;
  const installedVersion = options.installedVersion ?? own.version;
  const profile = options.profile ?? DEFAULT_PLUGIN_PROFILE;
  const fetchImpl = options.fetchImpl ?? fetch;
  const latestVersion = await fetchNpmLatest(packageName, fetchImpl);
  if (latestVersion === undefined) {
    return idleStatus(packageName, installedVersion, profile);
  }
  return {
    installedVersion,
    latestVersion,
    updateAvailable: compareVersions(installedVersion, latestVersion) < 0,
    command: upgradeCommand(packageName, latestVersion, profile),
  };
}
