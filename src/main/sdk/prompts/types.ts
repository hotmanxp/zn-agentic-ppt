export type PromptVarType = "string" | "json";

export interface PromptVar {
  name: string;
  description: string;
  type: PromptVarType;
  /** Optional: shown in settings UI as a hint (e.g. 'target.bullets') */
  example?: string;
}

export type PromptId =
  | "OUTLINE_PROMPT"
  | "REGENERATE_PROMPT"
  | "SLIDE_SYSTEM_PROMPT"
  | "SLIDE_USER_PROMPT"
  | "INTENTION_PROMPT"
  | "PPT_PARENT_SYSTEM_PROMPT"
  | "PPT_PARENT_USER_PROMPT"
  | "PPT_SLIDE_GENERATOR_PROMPT";

export interface PromptSpec {
  id: PromptId;
  title: string;
  description: string;
  defaultTemplate: string;
  variables: PromptVar[];
}
