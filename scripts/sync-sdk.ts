#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_DIST = "/Users/ethan/code/opencc-worktree/dist/sdk.mjs";
const UPSTREAM_TYPES = "/Users/ethan/code/opencc-worktree/src/entrypoints/sdk.d.ts";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const VENDOR_DIR = join(HERE, "..", "vendor");

async function main() {
  if (!existsSync(UPSTREAM_DIST)) {
    console.error(`Upstream SDK not found at ${UPSTREAM_DIST}.`);
    console.error("Run `cd /Users/ethan/code/opencc-worktree && bun run build` first.");
    process.exit(1);
  }
  await cp(UPSTREAM_DIST, join(VENDOR_DIR, "sdk.mjs"));
  await cp(UPSTREAM_TYPES, join(VENDOR_DIR, "sdk.d.ts"));
  console.log("Synced SDK from upstream.");
}

main();
