import { homedir } from "node:os";
import { join } from "node:path";

const DATA_ROOT = join(homedir(), ".zn-agentic-ppt");

let testProjectsDir: string | null = null;
export function setProjectsDirForTest(dir: string): void {
  testProjectsDir = dir;
}

export function getDataRoot(): string {
  return DATA_ROOT;
}

export function getProjectsDir(): string {
  return testProjectsDir ?? join(DATA_ROOT, "projects");
}

export function getSettingsPath(): string {
  return join(DATA_ROOT, "settings.json");
}

export function getLogsDir(): string {
  return join(DATA_ROOT, "logs");
}

export function getCacheDir(): string {
  return join(DATA_ROOT, "cache");
}

export function getProjectDir(id: string): string {
  return join(getProjectsDir(), id);
}
