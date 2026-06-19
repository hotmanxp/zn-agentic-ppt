import type { Outline } from '../../shared/types.js'
import { extractFirstJsonValue } from './json-extract.js'

/**
 * Builds the prompt for the outline-generation LLM. Returns a JSON
 * outline with `slides[]` (each slide has title/bullets/notes + a
 * suggested `layout`) plus a top-level `globalStyle` so the slide
 * generation step has a consistent palette.
 *
 * Per frontend-slides skill guidance:
 *   - Global style info → keeps the whole deck visually consistent
 *   - Per-slide layout → avoids the same layout twice in a row
 *   - Must include cover (first) + closing (last)
 */
export function buildOutlinePrompt(topic: string, source: string): string {
  return `你是 PPT 大纲编辑 + 视觉策划。用户会给你原始内容（文章、笔记、要点）。
请把它结构化成 4-8 张幻灯片的大纲，每页包含：
- title: 标题（≤ 20 字）
- bullets: 要点数组（2-5 项，每项 ≤ 30 字）
- notes: 可选，补充说明（≤ 50 字）
- layout: 该页建议的视觉布局（cover / list / columns / stats / quote / closing 之一）

【全局风格】（整套 PPT 保持视觉一致 — 每张幻灯片都会遵循）
- 主色 #1677ff（蓝）
- 强调色 #722ed1（紫）
- 暖色装饰 #f59e0b（橙，仅 cover/closing 用）
- 字体 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
- 尺寸 16:9
- 一张幻灯片只用一种 layout，不要混

【布局类型说明】（每张选一种，相邻页不要用同一种）
- cover: 封面页，大标题 + 副标题，仅 1 张（必须放在第 1 张）
- list: 卡片列表，4-6 条要点
- columns: 左右分栏，对比/并列/正反
- stats: 大数字 / KPI（适合百分比/数据/效果）
- quote: 居中引言 / 金句（10 张里最多用 1-2 次）
- closing: 结尾页（致谢 / Q&A / 总结），仅 1 张（必须放在最后 1 张）

【结构硬性要求】
- 第 1 张必须是 cover
- 最后 1 张必须是 closing
- 中间 N-2 张循环使用 list / columns / stats / quote，避免连续 2 张同一种
- N = 4 ~ 8 张

输出 JSON 格式（不要解释，直接输出）：
{
  "globalStyle": {
    "primaryColor": "#1677ff",
    "accentColor": "#722ed1",
    "fontFamily": "-apple-system, \\"PingFang SC\\", \\"Microsoft YaHei\\", sans-serif",
    "aspectRatio": "16/9"
  },
  "slides": [
    { "title": "...", "bullets": [...], "layout": "cover" },
    { "title": "...", "bullets": [...], "layout": "list" },
    ...,
    { "title": "...", "bullets": [...], "layout": "closing" }
  ]
}

用户主题：${topic}

用户原始内容：
${source}`
}

/**
 * Parses the LLM's JSON response into an Outline. Falls back gracefully
 * if the LLM returned a partial / non-conforming object.
 */
export function parseOutlineResponse(raw: string): Outline {
  const empty: Outline = {
    slides: [],
    generatedAt: Date.now(),
  }

  // Use depth-aware extractor that handles ```json fences and avoids
  // the naive greedy regex over-matching into trailing prose.
  let parsed: any
  try {
    parsed = extractFirstJsonValue(raw)
  } catch {
    return empty
  }
  if (parsed === null || typeof parsed !== 'object') return empty

  const slides = Array.isArray(parsed.slides) ? parsed.slides : []
  const norm = slides
    .map((s: any, i: number) => {
      const title = typeof s?.title === 'string' ? s.title.trim() : ''
      const bullets = Array.isArray(s?.bullets)
        ? s.bullets.filter((b: unknown): b is string => typeof b === 'string').map((b: string) => b.trim())
        : []
      const notes = typeof s?.notes === 'string' ? s.notes.trim() : undefined
      const layout = typeof s?.layout === 'string' ? s.layout.trim() : undefined
      return { title, bullets, notes, layout, _i: i }
    })
    .filter((s: { title: string; bullets: string[] }) => s.title && s.bullets.length > 0)
    .map(({ _i, ...rest }: { _i: number; [k: string]: unknown }) => {
      // Enforce cover on first and closing on last if the LLM didn't follow
      let layout = rest.layout as string | undefined
      if (_i === 0 && layout !== 'cover') layout = 'cover'
      if (_i === slides.length - 1 && layout !== 'closing') layout = 'closing'
      return { ...rest, layout }
    })

  // If for some reason no cover/closing ended up first/last, force them
  if (norm.length > 0) {
    norm[0] = { ...norm[0], layout: 'cover' }
    norm[norm.length - 1] = { ...norm[norm.length - 1], layout: 'closing' }
  }

  const globalStyle = (typeof parsed.globalStyle === 'object' && parsed.globalStyle !== null)
    ? parsed.globalStyle
    : undefined

  return {
    slides: norm.map((s: { title: string; bullets: string[]; notes?: string; layout?: string }, i: number) => ({
      id: `slide-${i + 1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: s.title,
      bullets: s.bullets,
      notes: s.notes,
      layout: s.layout as any,
    })),
    generatedAt: Date.now(),
    globalStyle: globalStyle as any,
  }
}
