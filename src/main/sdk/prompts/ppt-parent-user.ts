import type { PromptSpec } from "./types.js";

export const pptParentUserPrompt: PromptSpec = {
  id: "PPT_PARENT_USER_PROMPT",
  title: "PPT 编排父 agent 用户提示词",
  description: "把 outline/intent/style + 预渲染的子 agent prompt 数组拼成一个 user message 给父 agent。",
  defaultTemplate: `## Outline 摘要
{{outlineSummary}}

## Intent（来自 intent.json）
{{intentJson}}

## Style（来自 style.json）
{{styleJson}}

## 待生成 slides
{{slidesJson}}

## 子 agent 指令（已预渲染，直接 dispatch，不要改）
{{subAgentPromptsJson}}

## 任务
对每张 slide 派发一个 Agent 工具调用（subagent_type=general-purpose,
run_in_background=true, description="Generate slide <slideId>",
prompt=上面数组里对应 slideId 的 prompt）。

第一轮 turn 全部一起发，不要分批。`,
  variables: [
    { name: "outlineSummary", description: "outline 摘要文本", type: "string" },
    { name: "intentJson", description: "intent.json 内容", type: "json" },
    { name: "styleJson", description: "style.json 内容", type: "json" },
    { name: "slidesJson", description: "待生成 slide 列表", type: "json" },
    { name: "subAgentPromptsJson", description: "预渲染的子 agent prompt 数组", type: "json" },
  ],
};
