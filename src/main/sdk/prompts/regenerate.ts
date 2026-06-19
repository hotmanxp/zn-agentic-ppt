import type { PromptSpec } from './types.js'

export const regeneratePrompt: PromptSpec = {
  id: 'regenerate',
  title: '单页重新生成',
  description: '根据整页 outline + 当前 HTML 风格，重新生成单页 HTML（layout 强制对齐轮换）。',
  defaultTemplate: `你是 PPT 单页编辑 + 视觉设计师。用户要重新生成其中一页。

【硬性要求】这一页必须有完整、专业的视觉布局与样式 —— 不是裸 HTML，不是纯白底黑字列表。

{{layoutHint}}

目标页 outline:
{{target}}

其他页（保留整体连贯）:
{{others}}

当前页的现有 HTML（参考风格，可借鉴渐变/排版）:
{{currentSectionHtml}}

【设计系统】
- 主色 #1677ff（蓝），强调 #722ed1（紫）
- 背景：深色渐变 linear-gradient(135deg,#0b1020 0%,#1e1b4b 100%)
- 字体：-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
- **必须**写出有视觉层次的排版：可用 inline style，也可在 <section> 内用 <style>.xxx{}</style> 抽公共 class 减少重复
- **不要**输出 <script>/<html>/<head>/<body>，只输出 <section> 片段
- 标题字号 ≥ 44px、加粗、有渐变或主色高亮

【布局参考】5 种 layout 轮换使用：
- layout-1 封面: 居中 + 双 radial-gradient 装饰光斑 + 大字渐变标题
- layout-2 卡片列表: grid auto-fit + 玻璃拟态卡片 + 编号
- layout-3 左右分栏: 1fr 1fr grid + 双色 border-left 强调
- layout-4 大数字: 3 列 grid + 96px 渐变数字
- layout-5 居中引言: 居中布局 + 装饰引号

【任务】
1. 用 Read 工具读取 slides/{{slideId}}.html（当前内容）
2. 用 Write 工具覆盖为 layout-{{layout}} 风格的 HTML section
3. 完成后回复 "done"

只输出 <section data-id="{{slideId}}">...</section>。`,
  variables: [
    { name: 'target', description: '目标页 outline（含 id/title/bullets/notes）', type: 'json' },
    { name: 'others', description: '其他页标题数组（用于连贯性）', type: 'json' },
    { name: 'currentSectionHtml', description: '当前页现有 HTML 字符串', type: 'string' },
    { name: 'layout', description: '本张幻灯片 layout 编号 (1-5)，用于「layoutHint」拼接', type: 'string', example: '2' },
    { name: 'slideId', description: '本张幻灯片 id（用于 Read/Write 路径）', type: 'string' },
    { name: 'layoutHint', description: '预渲染的 layout 提示文本（来自调用方，可为空）', type: 'string' },
  ],
}
