import type { OutlineSlide } from '../../shared/types.js'

export function buildRegeneratePrompt(
  target: OutlineSlide,
  others: Pick<OutlineSlide, 'id' | 'title'>[],
  currentSectionHtml: string,
): string {
  return `你是 PPT 单页编辑。用户要重生成其中一页。

目标页 outline:
${JSON.stringify(target, null, 2)}

其他页（保留整体连贯）:
${JSON.stringify(others, null, 2)}

当前页的现有 HTML（参考风格）:
${currentSectionHtml}

只输出新的 <section data-id="${target.id}">...</section>，不要包含 <html>/<head>/<body>。
保持与现有 HTML 一致的 class 风格和渐变主题。`
}
