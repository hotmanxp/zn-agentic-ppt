#!/usr/bin/env bun
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist/main", { recursive: true, force: true });
await rm("dist/preload", { recursive: true, force: true });

// Main process: ESM (Node 20+)
await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/main/index.js",
  external: [
    "electron",
    "./vendor/*",
    "../vendor/*",
    "../../vendor/*",
    "../../../vendor/*",
    "@anthropic-ai/*",
    "@aws-sdk/*",
    "@google-cloud/*",
    "@modelcontextprotocol/*",
    "google-auth-library",
    "fsevents",
    // zai-agent-core runtime deps — keep as real ESM/CJS at runtime to avoid
    // esbuild inlining dynamic require()s of Node built-ins (e.g. "path"
    // inside proper-lockfile, which breaks Electron's ESM main bundle).
    "proper-lockfile",
    "js-yaml",
    "execa",
    "chalk",
    "figures",
    "diff",
    "lru-cache",
    "lodash-es",
    "axios",
    "undici",
    "https-proxy-agent",
    "zod",
  ],
  sourcemap: true,
  loader: { ".ts": "ts" },
});

// Preload: CJS (Electron's webPreferences.preload uses require()).
// Building as CJS avoids the "require() of ES Module" error at startup.
await build({
  entryPoints: ["src/preload/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/preload/index.cjs",
  external: ["electron"],
  sourcemap: true,
  loader: { ".ts": "ts" },
});

// Post-build: copy vendor next to the bundle and rewrite the import path.
await cp("vendor", "dist/main/vendor", { recursive: true });
const bundlePath = "dist/main/index.js";
let content = await readFile(bundlePath, "utf8");
content = content.replace(/from "\.\.\/\.\.\/\.\.\/vendor\/sdk\.mjs"/g, 'from "./vendor/sdk.mjs"');
await writeFile(bundlePath, content);
console.log("Main (ESM) + preload (CJS) built; vendor copied; SDK path rewritten.");
