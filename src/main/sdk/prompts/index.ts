import * as settingsFs from "../../fs/settings.js";
import type { PromptSpec, PromptVar } from "./types.js";

/**
 * Replaces {{var}} placeholders. Variables must be declared in `spec`;
 * runtime values come from `vars`. JSON variables are stringified with
 * 2-space indent. Unknown / missing variables throw — the caller is
 * expected to provide everything declared in the spec.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, unknown>,
  spec: PromptVar[],
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (match, name: string) => {
    const v = spec.find((s) => s.name === name);
    if (!v) throw new Error(`模板引用了未声明变量: ${match}`);
    if (!(name in vars)) throw new Error(`渲染变量 ${name} 缺值（prompt id 应在调用方传入）`);
    const val = vars[name];
    if (v.type === "json") return JSON.stringify(val, null, 2);
    return String(val);
  });
}

/**
 * Registry of all known prompts. Populated by individual spec modules.
 * Filled below via `registerPrompt()` to avoid circular imports.
 */
export const PROMPT_SPECS: PromptSpec[] = [];

export function registerPrompt(spec: PromptSpec): void {
  if (PROMPT_SPECS.some((s) => s.id === spec.id)) {
    throw new Error(`prompt id 重复: ${spec.id}`);
  }
  PROMPT_SPECS.push(spec);
}

export function getSpec(id: string): PromptSpec | null {
  return PROMPT_SPECS.find((s) => s.id === id) ?? null;
}

/**
 * Renders a prompt by id. Picks override from settings (if set) or the
 * spec's default template, then fills declared variables. Throws on
 * unknown id, undeclared variables, or missing runtime values.
 */
export async function renderPrompt(id: string, vars: Record<string, unknown>): Promise<string> {
  const spec = getSpec(id);
  if (!spec) throw new Error(`未知 prompt id: ${id}`);
  const override = await settingsFs.getPromptOverride(id);
  const template = override ?? spec.defaultTemplate;
  return fillTemplate(template, vars, spec.variables);
}

import { outlinePrompt } from "./outline.js";
registerPrompt(outlinePrompt);
import { regeneratePrompt } from "./regenerate.js";
registerPrompt(regeneratePrompt);
import { slideSystemPrompt } from "./slide-system.js";
registerPrompt(slideSystemPrompt);
import { slideUserPrompt } from "./slide-user.js";
registerPrompt(slideUserPrompt);
import { intentionPrompt } from "./intention.js";
registerPrompt(intentionPrompt);

import { pptParentSystemPrompt } from "./ppt-parent-system.js";
registerPrompt(pptParentSystemPrompt);
import { pptParentUserPrompt } from "./ppt-parent-user.js";
registerPrompt(pptParentUserPrompt);
import { pptSlideGeneratorPrompt } from "./ppt-slide-generator.js";
registerPrompt(pptSlideGeneratorPrompt);
