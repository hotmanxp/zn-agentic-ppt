import type { PromptSpec } from "./types.js";

export const pptSlideGeneratorPrompt: PromptSpec = {
  id: "PPT_SLIDE_GENERATOR_PROMPT",
  title: "PPT slide 生成子 agent 用户提示词",
  description:
    "每张 slide 的子 agent user prompt。由主进程预渲染时填充 slideId / 标题 / 要点 / 邻居文件路径。",
  defaultTemplate: `你是单张 PPT slide 的生成 agent。

## 产出
1 个 HTML <section> 块，写到 slides/{{slideId}}.html

## 当前任务
- slideId: {{slideId}}
- title: {{title}}
- bullets:
{{bullets}}
- notes: {{notes}}
- layout: {{layout}}（视觉方向：{{layoutDirection}}）
- 邻居 slide 文件（用 Read 看风格一致性）:
{{neighborPaths}}
- 全局样式（主色 / 强调色 / 字体）: {{style}}

## 视觉规则
- 16:9 aspect ratio（960×540）
- 必须 inline style（不用 class）
- <section data-layout="N"> 包裹
- 五种 layout 视觉方向参考你读到的邻居 slide

## 工作流
1. Read 邻居 slide 文件了解风格一致性
2. Write 初始 HTML 到 slides/{{slideId}}.html
3. Read 自己刚写的文件
4. 自检：结构闭合、data-layout、关键元素齐全
5. 不通过 → Edit 工具修复（最多 3 轮自迭代）
6. 最后输出简短报告：完成 / 修改了 X 处 / 内容覆盖了 Y`,
  variables: [
    { name: "slideId", description: "slide id", type: "string" },
    { name: "title", description: "slide 标题", type: "string" },
    { name: "bullets", description: "slide 要点（多行字符串）", type: "string" },
    { name: "notes", description: "slide 备注", type: "string" },
    { name: "layout", description: "layout 编号 1-5", type: "string" },
    { name: "layoutDirection", description: "layout 视觉方向描述", type: "string" },
    { name: "neighborPaths", description: "邻居 slide 文件路径（多行）", type: "string" },
    { name: "style", description: "全局样式 JSON 字符串", type: "string" },
  ],
};
