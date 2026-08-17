/**
 * Silent npm latest-version probe. Failure is treated as "no update" so the
 * settings card never blocks on the registry.
 * @module dsh-image-pathify/update
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImagePathifyUpdateStatus } from "./contract.ts";

/** npm registries to try, in order (npmmirror first for mainland networks). */
const REGISTRIES = [
  "https://registry.npmmirror.com",
  "https://registry.npmjs.org",
] as const;

/** Per-request timeout for a registry lookup. */
const FETCH_TIMEOUT_MS = 8000;

/** Overrides used by tests; production always reads the installed package. */
export interface CheckUpdateOptions {
  readonly fetchImpl?: typeof fetch;
  readonly installedVersion?: string;
  readonly packageName?: string;
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
export function upgradeCommand(packageName: string, version: string): string {
  return `dsh plugin --profile web add ${packageName}@${version}`;
}

/**
 * Compare two dotted versions (`1.2.3`). Pre-release suffixes are ignored.
 * @returns negative when `left` is older than `right`.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

function parseVersion(value: string): [number, number, number] {
  const core = value.trim().replace(/^v/i, "").split("-")[0] ?? "0";
  const parts = core.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function idleStatus(
  packageName: string,
  installedVersion: string,
): ImagePathifyUpdateStatus {
  return {
    installedVersion,
    latestVersion: installedVersion,
    updateAvailable: false,
    command: upgradeCommand(packageName, installedVersion),
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
  const fetchImpl = options.fetchImpl ?? fetch;
  const latestVersion = await fetchNpmLatest(packageName, fetchImpl);
  if (latestVersion === undefined) {
    return idleStatus(packageName, installedVersion);
  }
  return {
    installedVersion,
    latestVersion,
    updateAvailable: compareVersions(installedVersion, latestVersion) < 0,
    command: upgradeCommand(packageName, latestVersion),
  };
}
