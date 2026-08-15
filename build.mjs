/**
 * Host-side ESM build for dsh-image-pathify (no client half).
 *
 * `@deepseek-ai/dsh-*` and cordis stay external — the profile's healed
 * node_modules provides them, so classes and module state are not duplicated.
 * schemastery and dsh-home-paths are bundled (the Loader validates the
 * exported `Config` schema against its own schemastery instance).
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("lib", { recursive: true });

const dshExternal = ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*"];

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node22"],
  sourcemap: true,
  external: dshExternal,
  logLevel: "info",
});

// Declaration output for `types` consumers.
execFileSync("node_modules/.bin/tsc", ["-p", "tsconfig.build.json"], {
  stdio: "inherit",
});
