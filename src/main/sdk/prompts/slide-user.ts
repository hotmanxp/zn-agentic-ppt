import type { PromptSpec } from "./types.js";

// Layout directions: each is for a 960×540 (16:9) canvas. Anything
// described here must fit horizontally — vertical space is tight
// (540px) and the LLM tends to over-stuff if not reminded. The
// reminder is also in SLIDE_SYSTEM_PROMPT.
const LAYOUT_DIRECTIONS = [
  `深色 hero 封面（960×540 横构图）：深蓝/黑色背景 (#0b1020 / #1e3a8a)；上方 left/right 用 200-280px radial 光斑装饰（position:absolute）；标题居中偏下、font-size:80-100px、白色粗体（**不要超过 100px**）；顶部可加 14-18px 的 "CHAPTER" 大写小标签；下方加 1 条 4px 橙色分隔线 + 18-20px 副标题。**所有装饰 absolute 锚定**，不要走文档流。`,
  `暖橙卡片网格（960×540 横构图，分 2 列卡片更稳）：暖白/橙色渐变背景 (#fff7ed / #fed7aa)；标题在顶部 font-size:36-44px、深棕色 (#7c2d12)；要点用 2×2 白色卡片网格（**卡片用 position:absolute 钉在四角**，不要走 normal flow 让卡片堆下来）；每张卡片 16-20px 文字 + 28px 橙色圆形编号。**卡片数量控制在 4 个以内**。`,
  `左右双色对峙（960×540 横构图）：深色背景 (#0f172a)，左右两个 380px 宽分栏（position:absolute 锚定 left:0 / right:0），左暖红 (#7c2d12) / 右冷蓝 (#1e3a8a) 渐变面板；标题居中置顶 font-size:24-30px；左列标 ▶ 蓝色，右列标 ◆ 暖色；要点用 14-16px 细分隔线。**每个分栏要点 ≤ 4 条**。`,
  `暗色霓虹大数字（960×540 横构图，纯黑 #020617 背景）：标题小写大写+灰白色 font-size:18-22px 顶部；下方 3 张大数字卡（**用 position:absolute 横向排列**，不要 vertical 堆叠），SF Mono 等宽数字 60-80px，颜色循环：绿 (#10b981) / 橙 (#f59e0b) / 红 (#ef4444)，每张卡顶部 2px 色条；卡片下 12-14px 小字说明。**只放 3 张卡**。`,
  `米色衬线引言（960×540 横构图）：米色背景 (#fef3c7)；中央 Georgia 衬线斜体大字 font-size:36-44px、深棕色 (#451a03)，**最多 4 行引言**；上下加装饰大引号（position:absolute，font-size:80-120px 浅橙 #b45309）；下方 14-16px 署名 "— 作者"。**整页只有引言 + 署名，不加其他内容**。`,
] as const;

export const slideUserPrompt: PromptSpec = {
  id: "SLIDE_USER_PROMPT",
  title: "单页用户提示词",
  description: "每张幻灯片的 per-turn 请求：项目元数据 + 本张内容 + layout 视觉方向。",
  defaultTemplate: `请为第 {{slideIndex}} 张 PPT（layout-{{layout}}）生成 HTML 内容并写入 slides/{{slideId}}.html。

【画布硬约束 — 违反任何一条 = 内容被裁/被截】
- **画布: 960×540 (16:9)**。所有内容必须装进这个盒子。
- <section> 的 inline style **必须**包含: position:relative; width:960px; height:540px; overflow:hidden; box-sizing:border-box;
- **禁止**: min-height: 100vh / 100% / > 540px 的任何值; height: auto; 在 section 外再加 wrapper div 撑高。
- 所有装饰元素（光斑/卡片/数字/引用块）**必须** position:absolute，用 top/right/bottom/left 锚定在画布四角 — 不要走 normal flow 堆叠（flow 堆叠必让 section 超高）。
- 字号上限: 标题 ≤ 60px，正文 ≤ 22px。要点 ≤ 6 条。超出请**压缩文字**，不要堆行。
- 写完 Write 之前自检: 整页在 960×540 框里不溢出？如溢出，缩字号或删装饰。

【项目信息】
CWD: {{cwd}}
共 {{totalSlides}} 张幻灯片, 当前要生成第 {{slideIndex}} 张

【文件结构】
- {{cwd}}/index.html — 框架(自动生成,不要改)
- {{cwd}}/slides/<id>.html — 每张幻灯片(你编辑这个)

【其他页标题】（保持整体连贯）
{{othersTitles}}

【本张内容】
标题: {{target.title}}
要点:
{{targetBullets}}
{{targetNotes}}

{{styleBlock}}
【layout-{{layout}} 视觉方向 — 这一页必须体现这种风格】
{{layoutDirection}}

【<section> 模板 — 直接套这个壳子】
<section data-id="{{slideId}}" style="position:relative;width:960px;height:540px;overflow:hidden;box-sizing:border-box;font-family:{{globalStyle.fontFamily}};">
  ... 你的内容 ...
</section>
**所有装饰元素都 position:absolute 锚定到四角**。壳子的 width/height/overflow/box-sizing 不能改 — 改了就违反 16:9 约束。

【操作步骤】
1. 用 Read 工具读 slides/{{slideId}}.html（已存在空模板）
2. 用 Write 工具覆盖整个文件为新的 <section> HTML（用上面的壳子），**按 layout-{{layout}} 的视觉方向加 inline style + 装饰元素（所有装饰用 position:absolute 锚定）**
3. **写完后在心里过一遍自检清单**: section 是 960×540 吗? 有没有 min-height / 100vh / auto? 装饰都 absolute 了吗? 整体能装下吗? 任何一个答案是"否"，回头改完再 Write。
4. 完成后回复 "done"`,
  variables: [
    { name: "cwd", description: "项目目录绝对路径", type: "string" },
    { name: "slideIndex", description: "当前幻灯片在整组中的位置（1-based）", type: "string" },
    { name: "totalSlides", description: "幻灯片总数", type: "string" },
    { name: "slideId", description: "当前幻灯片 id", type: "string" },
    { name: "layout", description: "当前 layout 编号 (1-5)", type: "string", example: "2" },
    { name: "target.title", description: "当前页标题", type: "string" },
    { name: "targetBullets", description: "当前页要点（预渲染为编号列表）", type: "string" },
    { name: "targetNotes", description: "当前页备注（可选，可能为空）", type: "string" },
    { name: "othersTitles", description: "其他页标题（预渲染为 bullet 列表）", type: "string" },
    { name: "styleBlock", description: "全局样式参数块（可选，可能为空）", type: "string" },
    {
      name: "layoutDirection",
      description: "当前 layout 的视觉方向描述（由调用方根据 layout 编号选）",
      type: "string",
    },
    {
      name: "globalStyle.fontFamily",
      description: "全局字体栈（来自 outline.globalStyle）",
      type: "string",
    },
  ],
};

export { LAYOUT_DIRECTIONS };
