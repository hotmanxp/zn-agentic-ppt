import type { PromptSpec } from "./types.js";

export const pptParentUserPrompt: PromptSpec = {
  id: "PPT_PARENT_USER_PROMPT",
  title: "PPT 编排父 agent 用户提示词（P1-4 精简版）",
  description: "slide 列表 + 固定 dispatch prompt 模板。父 LLM 只需要 iterate dispatch。",
  defaultTemplate: `## 待生成 slides（共 {{totalSlides}} 张）
{{slidesJson}}

## 任务
对每张 slide 用 Agent 工具派发：
- subagent_type=general-purpose
- run_in_background=true
- description="Generate slide <slideId>"
- prompt="读 tasks/<slideId>.md 拿完整任务（标题/要点/备注/layout/邻居 slide/全局样式），然后用 Write 工具生成 slides/<slideId>.html 的 <section> HTML。生成后用 Read 自检结构（<section> 元素、data-layout 属性、长度 > 200 字符），不通过用 Edit 修复。"

第一轮 turn 全部一起发（description 替换 <slideId>，prompt 里的 <slideId> 也替换）。`,
  variables: [
    { name: "totalSlides", description: "slide 总数", type: "string" },
    { name: "slidesJson", description: "slide 列表 JSON（id + title + layout）", type: "json" },
  ],
};
