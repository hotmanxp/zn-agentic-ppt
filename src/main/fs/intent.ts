import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectDir } from "./paths.js";
import type { IntentSummary } from "../../shared/intent.js";

export async function readIntent(projectId: string): Promise<IntentSummary | null> {
  const path = join(getProjectDir(projectId), "intent.json");
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as IntentSummary;
}

export async function writeIntent(projectId: string, intent: IntentSummary): Promise<void> {
  const dir = getProjectDir(projectId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "intent.json");
  await writeFile(path, JSON.stringify(intent, null, 2));
}

export async function intentExists(projectId: string): Promise<boolean> {
  return existsSync(join(getProjectDir(projectId), "intent.json"));
}
