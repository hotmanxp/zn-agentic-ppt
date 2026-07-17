import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Settings } from "../../shared/types.js";
import { getDataRoot, getSettingsPath } from "./paths.js";

let testPath: string | null = null;
export function setSettingsPathForTest(p: string): void {
  testPath = p;
}
const realPath = (): string => testPath ?? getSettingsPath();

export function defaultSettings(): Settings {
  return {
    llm: {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-3-5-sonnet-20241022",
      useOpenPlatform: false,
    },
    ui: { theme: "light" },
    paths: { projectsDir: join(getDataRoot(), "projects") },
  };
}

export async function getSettings(): Promise<Settings> {
  const p = realPath();
  if (!existsSync(p)) return defaultSettings();
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const defaults = defaultSettings();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    return {
      ...defaults,
      ...parsed,
      llm: { ...defaults.llm, ...(parsed.llm ?? {}) },
      ui: { ...defaults.ui, ...(parsed.ui ?? {}) },
      paths: { ...defaults.paths, ...(parsed.paths ?? {}) },
    };
  } catch {
    return defaultSettings();
  }
}

export async function setSettings(settings: Settings): Promise<void> {
  const p = realPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(settings, null, 2));
}

export async function getPromptOverride(id: string): Promise<string | null> {
  const s = await getSettings();
  return s.prompts?.[id] ?? null;
}

export async function setPromptOverride(id: string, template: string): Promise<void> {
  const s = await getSettings();
  const prompts = { ...(s.prompts ?? {}), [id]: template };
  await setSettings({ ...s, prompts });
}

export async function resetPromptOverride(id: string): Promise<void> {
  const s = await getSettings();
  const prompts = { ...(s.prompts ?? {}) };
  delete prompts[id];
  await setSettings({ ...s, prompts });
}

export async function listPromptOverrides(): Promise<Record<string, string>> {
  const s = await getSettings();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.prompts ?? {})) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
