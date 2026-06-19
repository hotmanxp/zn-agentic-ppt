import type { OutlineSlide } from '../../shared/types.js'

export function buildRegeneratePrompt(
  target: OutlineSlide,
  others: Pick<OutlineSlide, 'id' | 'title'>[],
  currentSectionHtml: string,
  layout?: 1 | 2 | 3 | 4 | 5,
): string {
  return `你是 PPT 单页编辑 + 视觉设计师。用户要重新生成其中一页。

【硬性要求】这一页必须有完整、专业的视觉布局与样式 —— 不是裸 HTML，不是纯白底黑字列表。

${layout ? `【本张幻灯片指定 layout = layout-${layout}】—— **必须**使用对应的模板，与整套 PPT 的轮换 layout 一致。` : ''}

目标页 outline:
${JSON.stringify(target, null, 2)}

其他页（保留整体连贯）:
${JSON.stringify(others, null, 2)}

当前页的现有 HTML（参考风格，可借鉴渐变/排版）:
${currentSectionHtml}

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
1. 用 Read 工具读取 slides/${target.id}.html（当前内容）
2. 用 Write 工具覆盖为 layout-${layout ?? 'N'} 风格的 HTML section
3. 完成后回复 "done"

只输出 <section data-id="${target.id}">...</section>。`
}
