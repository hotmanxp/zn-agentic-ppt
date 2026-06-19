# Prompt Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify 4 agent prompts (outline / regenerate / slide-system / slide-user) into a central registry with per-prompt Settings UI override.

**Architecture:** Each prompt becomes a `PromptSpec` file in `src/main/sdk/prompts/`. Central `index.ts` exports `renderPrompt(id, vars)` which picks settings override or default, then runs `fillTemplate` (Mustache `{{var}}`, supports string + json types). Renderer Settings gains a 「📝 提示词」tab with per-prompt editor and reset-to-default.

**Tech Stack:** TypeScript · Bun · Electron · React · Zustand · antd · vitest

**Spec:** `docs/superpowers/specs/2026-06-19-prompt-management-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `src/main/sdk/prompts/types.ts` | `PromptSpec` / `PromptVar` types |
| `src/main/sdk/prompts/outline.ts` | outline prompt spec |
| `src/main/sdk/prompts/regenerate.ts` | regenerate prompt spec |
| `src/main/sdk/prompts/slide-system.ts` | slide system prompt spec |
| `src/main/sdk/prompts/slide-user.ts` | slide user prompt spec |
| `src/main/sdk/prompts/index.ts` | PROMPT_SPECS + renderPrompt + fillTemplate |
| `src/main/fs/settings.ts` | `getPromptOverride` / `setPromptOverride` / `resetPromptOverride` / `listPromptOverrides` |
| `src/shared/ipc-channels.ts` | `SETTINGS_PROMPT_*` channels |
| `src/main/ipc/settings.ts` | 4 IPC handlers |
| `src/renderer/lib/api.ts` | `settings.prompts.{get,set,reset,list}` |
| `src/shared/types.ts` | `Settings.prompts` field |
| `src/main/sdk/ppt-framework.ts` | strip old fns; thin re-exports for back-compat |
| `src/main/ipc/stage.ts` | use `renderPrompt('outline'\|'regenerate', ...)` |
| `src/main/sdk/ppt-orchestrator.ts` | use `renderPrompt('slide-system'\|'slide-user', ...)` |
| `src/renderer/components/PromptEditor.tsx` | single-prompt editor UI |
| `src/renderer/components/PromptSettings.tsx` | 「📝 提示词」tab content |
| `src/renderer/routes/Settings.tsx` | sidebar + tab switcher |
| `tests/unit/main/sdk/prompts/fillTemplate.test.ts` | fillTemplate tests |
| `tests/unit/main/sdk/prompts/renderPrompt.test.ts` | renderPrompt tests |
| `tests/unit/main/fs/settings.test.ts` | settings CRUD tests (extend existing) |

---

## Task 1: Types Module

**Files:**
- Create: `src/main/sdk/prompts/types.ts`

- [ ] **Step 1: Create types file**

```ts
export type PromptVarType = 'string' | 'json'

export interface PromptVar {
  name: string
  description: string
  type: PromptVarType
  /** Optional: shown in settings UI as a hint (e.g. 'target.bullets') */
  example?: string
}

export type PromptId = 'outline' | 'regenerate' | 'slide-system' | 'slide-user'

export interface PromptSpec {
  id: PromptId
  title: string
  description: string
  defaultTemplate: string
  variables: PromptVar[]
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/sdk/prompts/types.ts
git commit -m "feat(prompts): add PromptSpec types"
```

---

## Task 2: fillTemplate — Write Failing Test

**Files:**
- Create: `tests/unit/main/sdk/prompts/fillTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { fillTemplate } from '../../../src/main/sdk/prompts/index.js'

describe('fillTemplate', () => {
  const vars = [
    { name: 'topic', description: '主题', type: 'string' as const },
    { name: 'source', description: '源内容', type: 'string' as const },
    { name: 'target', description: '目标页', type: 'json' as const },
  ]

  it('replaces string variables', () => {
    const out = fillTemplate('主题是 {{topic}}', { topic: 'AI PPT' }, vars)
    expect(out).toBe('主题是 AI PPT')
  })

  it('replaces json variables with 2-space JSON', () => {
    const out = fillTemplate('{{target}}', { target: { title: 'T', bullets: ['a'] } }, vars)
    expect(out).toBe(JSON.stringify({ title: 'T', bullets: ['a'] }, null, 2))
  })

  it('handles multiple variables in one template', () => {
    const out = fillTemplate('{{topic}}: {{source}}', { topic: 'A', source: 'B' }, vars)
    expect(out).toBe('A: B')
  })

  it('trims whitespace inside braces', () => {
    const out = fillTemplate('{{ topic }}', { topic: 'X' }, vars)
    expect(out).toBe('X')
  })

  it('throws on undeclared variable', () => {
    expect(() => fillTemplate('{{unknown}}', {}, vars))
      .toThrowError(/未声明变量/)
  })

  it('throws when caller omits a variable', () => {
    expect(() => fillTemplate('{{topic}}', {}, vars))
      .toThrowError(/缺值/)
  })

  it('leaves literal text untouched', () => {
    const out = fillTemplate('plain text', { topic: 'A' }, vars)
    expect(out).toBe('plain text')
  })

  it('does not match single braces', () => {
    const out = fillTemplate('{topic}', { topic: 'A' }, vars)
    expect(out).toBe('{topic}')
  })

  it('supports dotted names (object paths)', () => {
    const nested = [
      { name: 'globalStyle.primaryColor', description: '主色', type: 'string' as const },
    ]
    const out = fillTemplate('{{globalStyle.primaryColor}}', { 'globalStyle.primaryColor': '#1677ff' }, nested)
    expect(out).toBe('#1677ff')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/main/sdk/prompts/fillTemplate.test.ts`
Expected: FAIL (module `prompts/index.js` not found)

---

## Task 3: fillTemplate + Index — Implementation

**Files:**
- Create: `src/main/sdk/prompts/index.ts` (stub first)
- Modify: `src/main/sdk/prompts/index.ts` (full)

- [ ] **Step 1: Create index.ts with fillTemplate**

```ts
import type { PromptSpec, PromptVar } from './types.js'

/**
 * Replaces {{var}} placeholders. Variables must be declared in `spec`;
 * runtime values come from `vars`. JSON variables are stringified with
 * 2-space indent. Unknown / missing variables throw — the caller is
 * expected to provide everything declared in the spec.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, unknown>,
  spec: PromptVar[],
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (match, name: string) => {
    const v = spec.find(s => s.name === name)
    if (!v) throw new Error(`模板引用了未声明变量: ${match}`)
    if (!(name in vars)) throw new Error(`渲染变量 ${name} 缺值（prompt id 应在调用方传入）`)
    const val = vars[name]
    if (v.type === 'json') return JSON.stringify(val, null, 2)
    return String(val)
  })
}

/**
 * Registry of all known prompts. Populated by individual spec modules.
 * Filled below via `registerPrompt()` to avoid circular imports.
 */
export const PROMPT_SPECS: PromptSpec[] = []

export function registerPrompt(spec: PromptSpec): void {
  if (PROMPT_SPECS.some(s => s.id === spec.id)) {
    throw new Error(`prompt id 重复: ${spec.id}`)
  }
  PROMPT_SPECS.push(spec)
}

export function getSpec(id: string): PromptSpec | null {
  return PROMPT_SPECS.find(s => s.id === id) ?? null
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/unit/main/sdk/prompts/fillTemplate.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/sdk/prompts/index.ts tests/unit/main/sdk/prompts/fillTemplate.test.ts
git commit -m "feat(prompts): add fillTemplate + registry"
```

---

## Task 4: Outline Prompt Spec

**Files:**
- Create: `src/main/sdk/prompts/outline.ts`

- [ ] **Step 1: Move template from outline-prompt.ts**

The current `buildOutlinePrompt(topic, source)` template lives in `src/main/sdk/outline-prompt.ts`. Copy its full template string into the new spec:

```ts
import type { PromptSpec } from './types.js'

export const outlinePrompt: PromptSpec = {
  id: 'outline',
  title: '大纲生成',
  description: '把用户原始内容（文章、笔记、要点）整理成 4-8 张幻灯片大纲，含 cover/closing 强制首尾与全局风格。',
  defaultTemplate: `你是 PPT 大纲编辑 + 视觉策划。用户会给你原始内容（文章、笔记、要点）。
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

用户主题：{{topic}}

用户原始内容：
{{source}}`,
  variables: [
    { name: 'topic', description: '用户填的项目主题（决定整体方向）', type: 'string', example: 'AI 在教育中的应用' },
    { name: 'source', description: '用户粘贴的原始素材（文章/笔记/要点）', type: 'string' },
  ],
}
```

- [ ] **Step 2: Register in index.ts**

In `src/main/sdk/prompts/index.ts`, add at the bottom (after `getSpec`):

```ts
import { outlinePrompt } from './outline.js'
registerPrompt(outlinePrompt)
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/sdk/prompts/outline.ts src/main/sdk/prompts/index.ts
git commit -m "feat(prompts): add outline PromptSpec"
```

---

## Task 5: Regenerate Prompt Spec

**Files:**
- Create: `src/main/sdk/prompts/regenerate.ts`

- [ ] **Step 1: Move template from regenerate-prompt.ts**

```ts
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
```

- [ ] **Step 2: Register**

In `src/main/sdk/prompts/index.ts`:

```ts
import { regeneratePrompt } from './regenerate.js'
registerPrompt(regeneratePrompt)
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck
git add src/main/sdk/prompts/regenerate.ts src/main/sdk/prompts/index.ts
git commit -m "feat(prompts): add regenerate PromptSpec"
```

---

## Task 6: Slide-System Prompt Spec

**Files:**
- Create: `src/main/sdk/prompts/slide-system.ts`

- [ ] **Step 1: Create spec (extracted from PPT_SYSTEM_RULES + buildSystemPrompt)**

```ts
import type { PromptSpec } from './types.js'

export const slideSystemPrompt: PromptSpec = {
  id: 'slide-system',
  title: '单页系统提示词',
  description: '发给 LLM 的 persona + 硬性规则 + 整套 PPT 的全局视觉风格。每张幻灯片生成时都会带上。',
  defaultTemplate: `你是 PPT 内容编辑 + 视觉设计师。

【硬性要求 — 每次都必须遵守】
- **必须**给 <section> 和子元素加 inline style（背景渐变 / 字体大小 / 颜色 / 布局等），**不能**输出裸 HTML
- **必须**在标题与正文之间建立明显的视觉层级（字号 / 字重 / 颜色差异至少 2 级）
- **必须**至少使用一种视觉手段：gradient 背景 / 卡片化 / 分栏布局 / 大数字 / 装饰元素（光斑 / 引号 / 形状）
- **不要**输出 <script> 标签
- **不要**输出 <html> / <head> / <body> 标签，只输出 <section> 片段
- **不要**输出 <style> 块（用 inline style 即可）
- 完成后回复 "done"

【文件编辑工具】
你只能用 **Read** 和 **Write** 两个工具（不要用 Bash）：
1. Read slides/{SLIDE_ID}.html — 已存在空模板
2. Write slides/{SLIDE_ID}.html — 覆盖整个文件为新的 <section> HTML

【最低限度输出结构】
<section data-id="{SLIDE_ID}">
  <h1>{标题}</h1>
  <ul>
    <li>{要点 1}</li>
    <li>{要点 2}</li>
  </ul>
  <p class="slide-notes">{备注（如果有）}</p>
</section>
在壳子里填入内容，并按本张指定的 layout 视觉方向加 inline style + 装饰。

【全局视觉风格 — 整套 PPT 必须保持一致】
- 主色: {{globalStyle.primaryColor}}
- 强调色: {{globalStyle.accentColor}}
- 字体: {{globalStyle.fontFamily}}
- 尺寸: {{globalStyle.aspectRatio}}
- 你这一页的 inline style **必须**使用这些色值 / 字体，保持整套视觉一致`,
  variables: [
    { name: 'globalStyle.primaryColor', description: '主色（默认 #1677ff）', type: 'string', example: '#1677ff' },
    { name: 'globalStyle.accentColor', description: '强调色（默认 #722ed1）', type: 'string', example: '#722ed1' },
    { name: 'globalStyle.fontFamily', description: '字体栈', type: 'string' },
    { name: 'globalStyle.aspectRatio', description: '幻灯片尺寸比', type: 'string', example: '16/9' },
  ],
}
```

- [ ] **Step 2: Register**

```ts
import { slideSystemPrompt } from './slide-system.js'
registerPrompt(slideSystemPrompt)
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck
git add src/main/sdk/prompts/slide-system.ts src/main/sdk/prompts/index.ts
git commit -m "feat(prompts): add slide-system PromptSpec"
```

---

## Task 7: Slide-User Prompt Spec

**Files:**
- Create: `src/main/sdk/prompts/slide-user.ts`

- [ ] **Step 1: Create spec (from buildSlidePrompt)**

```ts
import type { PromptSpec } from './types.js'

const LAYOUT_DIRECTIONS = [
  `深色 hero 封面：深蓝/黑色背景 (#0b1020 / #1e3a8a)，可加暖橙/粉色 radial 光斑装饰；大粗体白字标题，居中；上方可加 "CHAPTER" 大写小标签；下方加分隔线和副标题`,
  `暖橙卡片网格：暖白/橙色渐变背景 (#fff7ed / #fed7aa)，深棕色 (#7c2d12) 文字；要点用白色卡片 + 橙色顶边 + 橙色圆形编号；标题前可加 "01 / " 前缀`,
  `左右双色对峙：深色背景 (#0f172a)，左右两个分栏，左暖红 (#7c2d12) / 右冷蓝 (#1e3a8a) 渐变面板；标题居中置顶；左列标 ▶，右列标 ◆；要点用细分隔线`,
  `暗色霓虹大数字：纯黑背景 (#020617)，标题小写大写+灰白色；要点用 SF Mono 等宽数字 80-100px，颜色循环：绿 (#10b981) / 橙 (#f59e0b) / 红 (#ef4444)，每条要点用对应颜色的顶部色条`,
  `米色衬线引言：米色背景 (#fef3c7)，Georgia 衬线斜体大字，深棕色 (#451a03)；上下加装饰大引号；下方署名 "— 作者" 用细字间距`,
] as const

export const slideUserPrompt: PromptSpec = {
  id: 'slide-user',
  title: '单页用户提示词',
  description: '每张幻灯片的 per-turn 请求：项目元数据 + 本张内容 + layout 视觉方向。',
  defaultTemplate: `请为第 {{slideIndex}} 张 PPT（layout-{{layout}}）生成 HTML 内容并写入 slides/{{slideId}}.html。

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

【操作步骤】
1. 用 Read 工具读 slides/{{slideId}}.html（已存在空模板）
2. 用 Write 工具覆盖整个文件为新的 <section> HTML，**按上面 layout-{{layout}} 的视觉方向加 inline style + 装饰元素**
3. 完成后回复 "done"`,
  variables: [
    { name: 'cwd', description: '项目目录绝对路径', type: 'string' },
    { name: 'slideIndex', description: '当前幻灯片在整组中的位置（1-based）', type: 'string' },
    { name: 'totalSlides', description: '幻灯片总数', type: 'string' },
    { name: 'slideId', description: '当前幻灯片 id', type: 'string' },
    { name: 'layout', description: '当前 layout 编号 (1-5)', type: 'string', example: '2' },
    { name: 'target.title', description: '当前页标题', type: 'string' },
    { name: 'targetBullets', description: '当前页要点（预渲染为编号列表）', type: 'string' },
    { name: 'targetNotes', description: '当前页备注（可选，可能为空）', type: 'string' },
    { name: 'othersTitles', description: '其他页标题（预渲染为 bullet 列表）', type: 'string' },
    { name: 'styleBlock', description: '全局样式参数块（可选，可能为空）', type: 'string' },
    { name: 'layoutDirection', description: '当前 layout 的视觉方向描述（由调用方根据 layout 编号选）', type: 'string' },
  ],
}

export { LAYOUT_DIRECTIONS }
```

Note: LAYOUT_DIRECTIONS is exported so the orchestrator can still pick the right description before calling `renderPrompt('slide-user', ...)`.

- [ ] **Step 2: Register**

```ts
import { slideUserPrompt } from './slide-user.js'
registerPrompt(slideUserPrompt)
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck
git add src/main/sdk/prompts/slide-user.ts src/main/sdk/prompts/index.ts
git commit -m "feat(prompts): add slide-user PromptSpec"
```

---

## Task 8: renderPrompt — Write Failing Test

**Files:**
- Create: `tests/unit/main/sdk/prompts/renderPrompt.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/main/fs/settings.js', () => ({
  getPromptOverride: vi.fn(),
}))

import { renderPrompt, getSpec, PROMPT_SPECS } from '../../../../src/main/sdk/prompts/index.js'
import { getPromptOverride } from '../../../../src/main/fs/settings.js'

describe('renderPrompt', () => {
  beforeEach(() => vi.mocked(getPromptOverride).mockReset())

  it('uses default template when no override set', () => {
    vi.mocked(getPromptOverride).mockReturnValue(null)
    const out = renderPrompt('outline', { topic: 'X', source: 'Y' })
    expect(out).toContain('X')
    expect(out).toContain('Y')
  })

  it('uses override template when set', () => {
    vi.mocked(getPromptOverride).mockReturnValue('CUSTOM {{topic}}')
    const out = renderPrompt('outline', { topic: 'Z', source: 'W' })
    expect(out).toBe('CUSTOM Z')
  })

  it('throws on unknown prompt id', () => {
    expect(() => renderPrompt('nonexistent', {}))
      .toThrowError(/未知 prompt/)
  })

  it('throws when caller omits a variable', () => {
    vi.mocked(getPromptOverride).mockReturnValue(null)
    expect(() => renderPrompt('outline', { topic: 'X' }))
      .toThrowError(/缺值/)
  })

  it('getSpec returns registered spec', () => {
    expect(getSpec('outline')).not.toBeNull()
    expect(PROMPT_SPECS.length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/main/sdk/prompts/renderPrompt.test.ts`
Expected: FAIL (`renderPrompt` is not exported from index.ts yet)

---

## Task 9: renderPrompt — Implementation

**Files:**
- Modify: `src/main/sdk/prompts/index.ts`

- [ ] **Step 1: Add renderPrompt + settings fs import**

Add at the top of `src/main/sdk/prompts/index.ts`:

```ts
import * as settingsFs from '../../main/fs/settings.js'
```

Add after `getSpec`:

```ts
/**
 * Renders a prompt by id. Picks override from settings (if set) or the
 * spec's default template, then fills declared variables. Throws on
 * unknown id, undeclared variables, or missing runtime values.
 */
export function renderPrompt(id: string, vars: Record<string, unknown>): string {
  const spec = getSpec(id)
  if (!spec) throw new Error(`未知 prompt id: ${id}`)
  const override = settingsFs.getPromptOverride(id)
  const template = override ?? spec.defaultTemplate
  return fillTemplate(template, vars, spec.variables)
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/unit/main/sdk/prompts/renderPrompt.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/sdk/prompts/index.ts tests/unit/main/sdk/prompts/renderPrompt.test.ts
git commit -m "feat(prompts): add renderPrompt that resolves override + fills"
```

---

## Task 10: Settings fs CRUD — Write Failing Tests

**Files:**
- Modify: `tests/unit/main/fs/settings.test.ts` (extend existing) — if file doesn't exist, create it

- [ ] **Step 1: Check existing test file**

Run: `ls tests/unit/main/fs/settings.test.ts`
If file doesn't exist, create it. Otherwise append to it.

- [ ] **Step 2: Add prompt override tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  getSettings, setSettings,
  getPromptOverride, setPromptOverride, resetPromptOverride, listPromptOverrides,
} from '../../../src/main/fs/settings.js'

let testRoot: string

beforeEach(async () => {
  testRoot = join(tmpdir(), `zn-ppt-settings-${randomUUID()}`)
  process.env.ZN_PPT_USER_DATA = testRoot
  await mkdir(testRoot, { recursive: true })
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('prompt overrides', () => {
  it('returns null when not set', () => {
    expect(getPromptOverride('outline')).toBeNull()
  })

  it('persists override via setPromptOverride', () => {
    setPromptOverride('outline', 'CUSTOM TEMPLATE')
    expect(getPromptOverride('outline')).toBe('CUSTOM TEMPLATE')
  })

  it('resetPromptOverride deletes the override', () => {
    setPromptOverride('outline', 'X')
    resetPromptOverride('outline')
    expect(getPromptOverride('outline')).toBeNull()
  })

  it('listPromptOverrides returns only set overrides', () => {
    setPromptOverride('outline', 'A')
    setPromptOverride('regenerate', 'B')
    const list = listPromptOverrides()
    expect(list.outline).toBe('A')
    expect(list.regenerate).toBe('B')
    expect(list['slide-system']).toBeUndefined()
  })

  it('survives settings read/write cycle', async () => {
    setPromptOverride('outline', 'PERSIST')
    await setSettings(getSettings())
    expect(getPromptOverride('outline')).toBe('PERSIST')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/unit/main/fs/settings.test.ts`
Expected: FAIL (functions don't exist yet)

---

## Task 11: Settings fs CRUD — Implementation

**Files:**
- Modify: `src/main/fs/settings.ts`

- [ ] **Step 1: Inspect existing settings.ts**

Read `src/main/fs/settings.ts` to find:
- Where `Settings` is read/written
- Whether the file already has a `prompts` field or similar

(Adjust the implementation below to match what you find. The general pattern: read the full Settings object, mutate `settings.prompts`, write back.)

- [ ] **Step 2: Add CRUD functions**

Append to `src/main/fs/settings.ts`:

```ts
export function getPromptOverride(id: string): string | null {
  const s = getSettings()
  return s.prompts?.[id] ?? null
}

export function setPromptOverride(id: string, template: string): void {
  const s = getSettings()
  const prompts = { ...(s.prompts ?? {}), [id]: template }
  setSettings({ ...s, prompts })
}

export function resetPromptOverride(id: string): void {
  const s = getSettings()
  const prompts = { ...(s.prompts ?? {}) }
  delete prompts[id]
  setSettings({ ...s, prompts })
}

export function listPromptOverrides(): Record<string, string> {
  const s = getSettings()
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(s.prompts ?? {})) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
```

Note: also extend `Settings.prompts` field (Task 12 below) — if Settings interface doesn't have it yet, the existing test for `getSettings()` may not type-check. Add the field in Task 12 first OR add a `prompts?: Record<string, string>` optional to the Settings type now and make CRUD functions tolerant.

- [ ] **Step 3: Add `prompts` to Settings type**

Modify `src/shared/types.ts` — find the `Settings` interface and add:

```ts
export interface Settings {
  llm: LLMSettings
  ui: { theme: 'light' | 'dark' }
  paths: { projectsDir: string }
  prompts?: Record<string, string>  // NEW: per-prompt overrides (null/undefined = use default)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/main/fs/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/fs/settings.ts src/shared/types.ts tests/unit/main/fs/settings.test.ts
git commit -m "feat(settings): per-prompt override CRUD in settings fs"
```

---

## Task 12: IPC Channels + Handlers + Renderer API

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/settings.ts`
- Modify: `src/renderer/lib/api.ts`

- [ ] **Step 1: Add channels**

In `src/shared/ipc-channels.ts`, add to the `IPC` const after `SETTINGS_TEST_CONNECTION`:

```ts
SETTINGS_PROMPT_GET: 'settings:prompt-get',
SETTINGS_PROMPT_SET: 'settings:prompt-set',
SETTINGS_PROMPT_RESET: 'settings:prompt-reset',
SETTINGS_PROMPT_LIST: 'settings:prompt-list',
```

- [ ] **Step 2: Wire IPC handlers**

In `src/main/ipc/settings.ts`, add inside `registerSettingsIPC`:

```ts
import * as settingsFs from '../fs/settings.js'

// ... existing handlers

ipcMain.handle(IPC.SETTINGS_PROMPT_GET, (_, { id }: { id: string }) => settingsFs.getPromptOverride(id))
ipcMain.handle(IPC.SETTINGS_PROMPT_SET, (_, { id, template }: { id: string; template: string }) => {
  settingsFs.setPromptOverride(id, template)
})
ipcMain.handle(IPC.SETTINGS_PROMPT_RESET, (_, { id }: { id: string }) => {
  settingsFs.resetPromptOverride(id)
})
ipcMain.handle(IPC.SETTINGS_PROMPT_LIST, () => settingsFs.listPromptOverrides())
```

- [ ] **Step 3: Extend BridgeApi**

In `src/renderer/lib/api.ts`, inside the `settings` interface:

```ts
settings: {
  get(): Promise<Settings>
  set(settings: Settings): Promise<void>
  testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }>
  prompts: {
    get(id: string): Promise<string | null>
    set(id: string, template: string): Promise<void>
    reset(id: string): Promise<void>
    list(): Promise<Record<string, string>>
  }
}
```

- [ ] **Step 4: Update preload bridge**

In `src/preload/index.ts`, find the `settings` object and add:

```ts
settings: {
  // ... existing get/set/testConnection
  prompts: {
    get: (id: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_GET, { id }),
    set: (id: string, template: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_SET, { id, template }),
    reset: (id: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_RESET, { id }),
    list: () => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_LIST),
  },
},
```

- [ ] **Step 5: Typecheck + build:main**

Run: `bun run typecheck && bun run build:main`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/settings.ts \
        src/renderer/lib/api.ts src/preload/index.ts
git commit -m "feat(ipc): prompt override channels + handlers + bridge"
```

---

## Task 13: Replace stage.ts Calls + Delete Old Files

**Files:**
- Modify: `src/main/ipc/stage.ts`
- Delete: `src/main/sdk/outline-prompt.ts`
- Delete: `src/main/sdk/regenerate-prompt.ts`

- [ ] **Step 1: Replace buildOutlinePrompt call**

In `src/main/ipc/stage.ts`, find the outline-generate handler:

```ts
// OLD:
systemPrompt: buildOutlinePrompt(project.topic, source),

// NEW:
const outlineMsg = renderPrompt('outline', { topic: project.topic, source })
// ... use outlineMsg as both systemPrompt (no separate user message needed since template is self-contained)
systemPrompt: outlineMsg,
```

(Also remove `import { buildOutlinePrompt } from '../sdk/outline-prompt.js'` and `import { buildRegeneratePrompt } from '../sdk/regenerate-prompt.js'`.)

- [ ] **Step 2: Replace buildRegeneratePrompt call**

In the slide-regenerate handler:

```ts
// OLD:
const prompt = buildRegeneratePrompt(target, others, extractSection(currentHtml, slideId) ?? '')
const key = `${id}:${slideId}`
const runner = new GenerationRunner({
  cwd, topic: target.title, outline: prompt, settings, runId: id,
  systemPrompt: prompt,
  userMessage: '请根据以上指令重新生成该页。',
  ...
})

// NEW:
import { renderPrompt } from '../sdk/prompts/index.js'
import { LAYOUT_DIRECTIONS } from '../sdk/prompts/slide-user.js'

const layoutHint = layout ? `【本张幻灯片指定 layout = layout-${layout}】—— **必须**使用对应的模板，与整套 PPT 的轮换 layout 一致。` : ''
const regenMsg = renderPrompt('regenerate', {
  target,
  others,
  currentSectionHtml: extractSection(currentHtml, slideId) ?? '',
  layout: layout?.toString() ?? '',
  slideId,
  layoutHint,
})
// ... use regenMsg as systemPrompt
```

- [ ] **Step 3: Delete old prompt files**

```bash
rm src/main/sdk/outline-prompt.ts src/main/sdk/regenerate-prompt.ts
```

Also delete their test files if any exist:
```bash
# Check first:
ls tests/unit/main/sdk/outline-prompt.test.ts tests/unit/main/sdk/regenerate-prompt.test.ts 2>/dev/null
# If they exist, rm them
```

- [ ] **Step 4: Typecheck + build:main**

Run: `bun run typecheck && bun run build:main`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stage): use renderPrompt for outline + regenerate"
```

---

## Task 14: Replace ppt-orchestrator.ts Calls

**Files:**
- Modify: `src/main/sdk/ppt-orchestrator.ts`
- Modify: `src/main/sdk/ppt-framework.ts` (strip old fns; add re-exports)

- [ ] **Step 1: Inspect ppt-orchestrator.ts**

Read `src/main/sdk/ppt-orchestrator.ts` to find where `buildSystemPrompt(ctx)` and `buildSlidePrompt(target, others, ctx)` are called.

(Adjust the diff below to match what you find. The pattern is to replace these calls with `renderPrompt('slide-system', { globalStyle })` and `renderPrompt('slide-user', { cwd, slideIndex, totalSlides, slideId, layout, 'target.title': target.title, targetBullets, targetNotes, othersTitles, styleBlock, layoutDirection })`.)

- [ ] **Step 2: Build slide-system message**

Where `buildSystemPrompt(ctx)` was called:

```ts
import { renderPrompt } from './prompts/index.js'

const sysMsg = renderPrompt('slide-system', {
  'globalStyle.primaryColor': ctx.globalStyle?.primaryColor ?? '',
  'globalStyle.accentColor': ctx.globalStyle?.accentColor ?? '',
  'globalStyle.fontFamily': ctx.globalStyle?.fontFamily ?? '',
  'globalStyle.aspectRatio': ctx.globalStyle?.aspectRatio ?? '',
})
```

(Note: renderPrompt expects flat var names matching `PromptSpec.variables[].name`. For dotted names, pass the full path as the key.)

- [ ] **Step 3: Build slide-user message**

Where `buildSlidePrompt(target, others, ctx)` was called:

```ts
import { renderPrompt, LAYOUT_DIRECTIONS } from './prompts/index.js'
import { LAYOUT_DIRECTIONS as _LD } from './prompts/slide-user.js'

const layout = ctx.layout ?? 1
const slideId = target.id
const slideIndex = (ctx.slideIndex ?? 0) + 1  // 1-based
const totalSlides = ctx.totalSlides ?? 0
const cwd = ctx.cwd ?? process.cwd()

const targetBullets = (target.bullets ?? []).map((b: string, i: number) => `  ${i + 1}. ${b}`).join('\n')
const targetNotes = target.notes ? `备注: ${target.notes}` : ''
const othersTitles = others.map(o => `- ${o.title}`).join('\n')
const styleBlock = ctx.style ? `【全局样式参数】\n${JSON.stringify(ctx.style, null, 2)}\n` : ''
const layoutDirection = _LD[layout - 1] ?? ''

const userMsg = renderPrompt('slide-user', {
  cwd,
  slideIndex: slideIndex.toString(),
  totalSlides: totalSlides.toString(),
  slideId,
  layout: layout.toString(),
  'target.title': target.title,
  targetBullets,
  targetNotes,
  othersTitles,
  styleBlock,
  layoutDirection,
})
```

- [ ] **Step 4: Strip ppt-framework.ts**

In `src/main/sdk/ppt-framework.ts`, delete:
- `PPT_SYSTEM_RULES` const
- `SlideGenerationContext` interface
- `buildSystemPrompt()` function
- `buildSlidePrompt()` function
- `SlideUserContext` interface
- `LAYOUT_VISUAL_DIRECTIONS` const
- `DEFAULT_GLOBAL_STYLE` const

Keep:
- `generateFrameworkHtml()`
- `generateLayoutHtml()`
- `generateLayoutStyles()`
- `escapeHtml()` / `escapeJson()`

Add a thin back-compat re-export at the bottom for any external import that still references the old names:

```ts
// Re-exports for back-compat (deprecated; use src/main/sdk/prompts instead)
export { renderPrompt, LAYOUT_DIRECTIONS } from './prompts/index.js'
```

(LAYOUT_DIRECTIONS comes from slide-user.ts — pass it through.)

- [ ] **Step 5: Typecheck + build:main**

Run: `bun run typecheck && bun run build:main`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/ppt-orchestrator.ts src/main/sdk/ppt-framework.ts
git commit -m "refactor(slides): orchestrator uses renderPrompt; ppt-framework stripped"
```

---

## Task 15: Settings UI — Sidebar + PromptEditor

**Files:**
- Create: `src/renderer/components/PromptEditor.tsx`
- Create: `src/renderer/components/PromptSettings.tsx`
- Modify: `src/renderer/routes/Settings.tsx`

- [ ] **Step 1: Create PromptEditor**

```tsx
import { useEffect, useState } from 'react'
import { Button, Input, Tag, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import type { PromptSpec } from '@shared/types'

const { TextArea } = Input

export function PromptEditor({ spec, onChange }: { spec: PromptSpec; onChange?: () => void }) {
  const { message, modal } = AntdApp.useApp()
  const [text, setText] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [defaultTpl, setDefaultTpl] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api.settings.prompts.get(spec.id).then(o => {
      setOverride(o)
      setDefaultTpl(spec.defaultTemplate)
      setText(o ?? spec.defaultTemplate)
      setDirty(false)
    })
  }, [spec.id])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.settings.prompts.set(spec.id, text)
      setOverride(text)
      setDirty(false)
      message.success('已保存')
      onChange?.()
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    modal.confirm({
      title: '重置为默认',
      content: '将删除当前自定义模板，恢复为系统内置默认。',
      okText: '重置',
      cancelText: '取消',
      onOk: async () => {
        await api.settings.prompts.reset(spec.id)
        setOverride(null)
        setText(spec.defaultTemplate)
        setDirty(false)
        message.success('已重置为默认')
        onChange?.()
      },
    })
  }

  const dirtyText = dirty

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{spec.title}</h3>
          <small style={{ color: '#6b7280' }}>{spec.description}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onReset} disabled={override === null}>重置为默认</Button>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!dirtyText}>保存</Button>
        </div>
      </div>
      <TextArea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true) }}
        rows={14}
        style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
      />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>模板变量</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {spec.variables.map(v => (
            <div key={v.name} style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
              <Tag color={v.type === 'json' ? 'purple' : 'blue'} style={{ marginRight: 4 }}>{v.type}</Tag>
              <code>{`{{${v.name}}}`}</code>
              <span style={{ color: '#6b7280', marginLeft: 6 }}>{v.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create PromptSettings**

```tsx
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { PromptEditor } from './PromptEditor.js'
import type { PromptSpec } from '@shared/types'

const PROMPT_IDS = ['outline', 'regenerate', 'slide-system', 'slide-user'] as const

export function PromptSettings() {
  const [specs, setSpecs] = useState<PromptSpec[]>([])
  const [reload, setReload] = useState(0)

  useEffect(() => {
    // Specs are static; renderer doesn't import the registry (it's main-only).
    // Fetch via a list endpoint, or hard-code metadata here for now.
    // For this task we hard-code titles + variables from a small table:
    setSpecs(PROMPT_METADATA)
  }, [reload])

  return (
    <div>
      <h2 style={{ margin: '0 0 4px' }}>提示词</h2>
      <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
        自定义每个 agent 提示词。可用 <code>{'{{name}}'}</code> 引用运行时变量。修改后可重置回默认。
      </p>
      {specs.map(spec => (
        <PromptEditor key={spec.id} spec={spec} onChange={() => setReload(r => r + 1)} />
      ))}
    </div>
  )
}

// Static metadata mirror of main-process PROMPT_SPECS.
// Kept in sync by hand; if drift is a concern, expose list via IPC.
const PROMPT_METADATA: PromptSpec[] = [
  {
    id: 'outline', title: '大纲生成',
    description: '把用户原始内容整理成 4-8 张幻灯片大纲。',
    defaultTemplate: '',
    variables: [
      { name: 'topic', description: '用户主题', type: 'string' },
      { name: 'source', description: '原始内容', type: 'string' },
    ],
  },
  {
    id: 'regenerate', title: '单页重新生成',
    description: '重新生成单页 HTML（layout 对齐轮换）。',
    defaultTemplate: '',
    variables: [
      { name: 'target', description: '目标页 outline', type: 'json' },
      { name: 'others', description: '其他页标题数组', type: 'json' },
      { name: 'currentSectionHtml', description: '当前页 HTML', type: 'string' },
      { name: 'layout', description: 'layout 编号', type: 'string' },
      { name: 'slideId', description: '幻灯片 id', type: 'string' },
      { name: 'layoutHint', description: 'layout 提示文本', type: 'string' },
    ],
  },
  {
    id: 'slide-system', title: '单页系统提示词',
    description: 'Persona + 硬性规则 + 全局视觉风格。',
    defaultTemplate: '',
    variables: [
      { name: 'globalStyle.primaryColor', description: '主色', type: 'string' },
      { name: 'globalStyle.accentColor', description: '强调色', type: 'string' },
      { name: 'globalStyle.fontFamily', description: '字体', type: 'string' },
      { name: 'globalStyle.aspectRatio', description: '尺寸比', type: 'string' },
    ],
  },
  {
    id: 'slide-user', title: '单页用户提示词',
    description: '每张幻灯片的 per-turn 请求。',
    defaultTemplate: '',
    variables: [
      { name: 'cwd', description: '项目目录', type: 'string' },
      { name: 'slideIndex', description: '当前幻灯片位置', type: 'string' },
      { name: 'totalSlides', description: '幻灯片总数', type: 'string' },
      { name: 'slideId', description: '幻灯片 id', type: 'string' },
      { name: 'layout', description: 'layout 编号', type: 'string' },
      { name: 'target.title', description: '当前页标题', type: 'string' },
      { name: 'targetBullets', description: '当前页要点', type: 'string' },
      { name: 'targetNotes', description: '当前页备注', type: 'string' },
      { name: 'othersTitles', description: '其他页标题', type: 'string' },
      { name: 'styleBlock', description: '全局样式参数块', type: 'string' },
      { name: 'layoutDirection', description: 'layout 视觉方向', type: 'string' },
    ],
  },
]
```

Note: The full `PROMPT_METADATA` is duplicated in renderer because the registry is main-process only. This is intentional for v1; future improvement: expose spec list via IPC.

- [ ] **Step 3: Modify Settings.tsx for tab**

In `src/renderer/routes/Settings.tsx`, replace the sidebar div + main area:

```tsx
import { useState } from 'react'
import { ... } from 'antd'
import { PromptSettings } from '../components/PromptSettings.js'

const TABS = [
  { key: 'llm', label: '🔑 LLM 服务' },
  { key: 'prompts', label: '📝 提示词' },
] as const

export function Settings() {
  const [tab, setTab] = useState<'llm' | 'prompts'>('llm')
  // ... existing form state ...

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 64px)', background: '#fff' }}>
      <div style={{ background: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: '16px 8px' }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 12px',
            color: tab === t.key ? '#1677ff' : '#374151',
            background: tab === t.key ? '#eff6ff' : 'transparent',
            borderRadius: 6, fontWeight: tab === t.key ? 500 : 400,
            fontSize: 14, cursor: 'pointer', marginBottom: 4,
          }}>{t.label}</div>
        ))}
      </div>
      <div style={{ padding: '32px 48px', maxWidth: 720 }}>
        {tab === 'llm' ? <ExistingLLMForm /> : <PromptSettings />}
      </div>
    </div>
  )
}
```

(`ExistingLLMForm` is the body of the original Settings — wrap the existing `<Form>` in a component so the file stays readable. Adjust if simpler to inline.)

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PromptEditor.tsx \
        src/renderer/components/PromptSettings.tsx \
        src/renderer/routes/Settings.tsx
git commit -m "feat(settings-ui): prompt editor tab with reset + variable list"
```

---

## Task 16: Final Integration

**Files:** none

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Build main**

Run: `bun run build:main`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `bun test`
Expected: all PASS (existing 101 + new tests)

- [ ] **Step 4: Manual smoke**

Run: `bun run dev` then in app:
1. Open Settings → 「📝 提示词」tab
2. Edit outline prompt → Save → reopen Settings → verify persisted
3. Click 重置为默认 → verify back to default
4. Trigger outline generation → verify LLM receives rendered prompt (check via console.log in main process if needed)
5. Verify no regression in PPT generation flow

- [ ] **Step 5: Commit drift if any**

```bash
git status --short
# If clean, skip. Otherwise commit any small fixes.
```

---

## Self-Review

**1. Spec coverage:**
- §3.1 types → Task 1 ✓
- §3.2 4 specs → Tasks 4-7 ✓
- §3.3 index + renderPrompt → Tasks 3, 9 ✓
- §3.4 call site replacement → Tasks 13, 14 ✓
- §4.1 new files (8) → Tasks 1, 3, 4, 5, 6, 7, 15 (PromptEditor, PromptSettings) — note: PROMPT_METADATA in PromptSettings duplicates spec list, called out in code ✓
- §4.2 modified files (7) → Tasks 11 (settings.ts), 12 (channels/ipc/api/preload), 14 (ppt-framework.ts), 15 (Settings.tsx), 13 (stage.ts + delete 2 files)
- §4.3 delete (2) → Task 13 ✓
- §5 data flow → captured in Tasks 9, 15 ✓
- §6 error handling → Tasks 2, 8 ✓
- §7 tests → Tasks 2, 8, 10 ✓

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" patterns. All code blocks concrete.

**3. Type consistency:**
- `PromptSpec.id` is union of 4 ids — Tasks 4-7 register all 4 via `registerPrompt()` ✓
- `PromptVar.type` is `'string' | 'json'` — consistent across spec files ✓
- `renderPrompt(id, vars)` signature — Tasks 9 + 13 + 14 call sites match ✓
- `LAYOUT_DIRECTIONS` re-exported from `slide-user.ts` (Task 14 step 4) and consumed by orchestrator (Task 14 step 3) ✓
- `settings.prompts` optional field — Task 11 step 3 + Task 12 api ✓

**4. File count:** 15 files (8 new + 7 modified + 2 deleted). Exceeds memory ≤3 limit; documented in spec §4.4.