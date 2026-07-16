import type { PromptSpec } from "./types.js";

export const intentionPrompt: PromptSpec = {
  id: "INTENTION_PROMPT",
  title: "意图提炼",
  description: "从 brief 提炼受众画像、目标拆解、语调、约束、覆盖点，作为大纲生成的 grounding",
  defaultTemplate: `你是 PPT 策划。请基于以下项目 brief 提炼一份结构化的「意图理解」，用于后续大纲与页面生成。

【项目 brief (markdown)】
{{briefMarkdown}}

输出严格 JSON(不要解释,直接输出):
{
  "audience": {
    "profile": "<一句话画像, ≤ 50 字>",
    "expertise": "<新手 | 熟手 | 专家>",
    "concerns": ["<关注点 1>", "<关注点 2>", ...]
  },
  "goal_decomposition": {
    "primary": "<主目标一句话>",
    "secondary": ["<次目标>", ...]
  },
  "tone": "<professional | technical | inspirational | casual>",
  "constraints": {
    "duration": "<如 '20 分钟'>",
    "pages": <number>,
    "language": "<zh-CN | en>"
  },
  "must_cover_points": ["<必讲点 1>", ...],
  "forbidden": ["<禁提点 1>", ...],
  "narrative_arc": "<如 '背景→痛点→方案→证据→行动'>"
}
`,
  variables: [
    {
      name: "briefMarkdown",
      type: "string",
      description: "项目 brief markdown",
    },
  ],
};
