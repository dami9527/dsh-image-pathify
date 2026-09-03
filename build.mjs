/**
 * Host-side ESM build plus a single-file client bundle.
 *
 * `@deepseek-ai/dsh-*` and cordis stay external — the profile's healed
 * node_modules provides them, so classes and module state are not duplicated.
 * schemastery is bundled (the Loader validates the exported `Config` schema
 * against its own schemastery instance).
 *
 * The web server serves exactly one file per client plugin
 * (`/plugins/dsh-image-pathify/client.js`), so the client half is one CJS
 * bundle wrapped in the ModuleLoader factory handshake.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

rmSync("lib", { recursive: true, force: true });
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

await build({
  entryPoints: ["src/client/index.ts"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  jsx: "automatic",
  external: [
    ...dshExternal,
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "scheduler",
  ],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-image-pathify', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: "return module.exports; } });",
  },
  logLevel: "info",
});

execFileSync("node_modules/.bin/tsc", ["-p", "tsconfig.build.json"], {
  stdio: "inherit",
});
