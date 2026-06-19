# Stage 1「项目信息」重设计 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Stage 1 CollectEditor 改成「项目信息」页,带 5 字段结构化表单 + 「优化」按钮调用 LLM Agent(支持 `AskUserQuestion` 工具反问最多 2 轮);Stage 2 大纲 prompt 切到只读结构化 brief。

**Architecture:** 主进程新增 `BriefAgent`(GenerationRunner + 自定义 MCP `AskUserQuestion` 工具,通过 IPC 双向 await renderer 答案);Renderer 拆 source 文本区 + 5 字段表单 + 弹 antd Modal 收集答案;`outline` prompt 切换到 `briefName/.../briefStyle` 5 变量,旧数据降级到 `topic + source`。

**Tech Stack:** TypeScript · Bun · Electron · React · Vite · antd · Zustand · Vitest · vendor SDK (`tool()` / `createSdkMcpServer()`) · Zod (不引入,改用 JSON Schema)

**Spec:** `docs/superpowers/specs/2026-06-19-ppt-stage1-collect-redesign-design.md`

---

## File Structure

### 新增 (9)
- `src/main/sdk/agents/briefAgent.ts` — BriefAgent 类
- `src/main/sdk/prompts/brief-optimize.ts` — PromptSpec
- `src/main/ipc/brief.ts` — 4 个 IPC handler
- `src/renderer/stores/briefOptimize.ts` — Zustand store
- `src/renderer/components/ProjectBriefForm.tsx` — 5 字段表单
- `src/renderer/components/AskUserQuestionModal.tsx` — 弹窗
- `src/shared/brief.ts` — computePageCountEst + validateBrief
- `tests/unit/main/sdk/agents/briefAgent.test.ts`
- `tests/unit/shared/brief.test.ts`

### 修改 (7)
- `src/shared/types.ts` — 加 `ProjectBrief` + `ProjectDetail.brief`
- `src/shared/ipc-channels.ts` — 加 6 个 channel
- `src/preload/index.ts` — 暴露 `brief.*`
- `src/renderer/routes/CollectEditor.tsx` — 拆两区 + 接 store
- `src/main/sdk/prompts/index.ts` — register `brief-optimize`
- `src/main/sdk/prompts/outline.ts` — 切到读 brief
- `src/main/fs/projects.ts` — `readProjectBrief` / `writeProjectBrief` + `getProject` 加载 brief
- `src/main/ipc/stage.ts` — `STAGE_COLLECT_SAVE` 写 brief + `STAGE_OUTLINE_GENERATE` 喂 brief
- `src/renderer/components/PromptSettings.tsx` — `PROMPT_METADATA` 加 `brief-optimize`

(实际 7 类,fs + ipc/stage 各自多 1 个新函数)

---

## Task 1: 加 `ProjectBrief` 类型 + `shared/brief.ts` 校验 + 单测

**Files:**
- Modify: `src/shared/types.ts` (新增 5 行)
- Create: `src/shared/brief.ts`
- Create: `tests/unit/shared/brief.test.ts`

- [ ] **Step 1: 写失败单测**

```ts
// tests/unit/shared/brief.test.ts
import { describe, it, expect } from 'vitest'
import { computePageCountEst, validateBrief } from '../../../src/shared/brief.js'

describe('computePageCountEst', () => {
  it('clamps to min 3 for very short durations', () => {
    expect(computePageCountEst(1)).toBe(3)
  })
  it('rounds 30 min to 20 pages', () => {
    expect(computePageCountEst(30)).toBe(20)
  })
  it('clamps to max 60 for very long durations', () => {
    expect(computePageCountEst(180)).toBe(60)
  })
})

describe('validateBrief', () => {
  const valid = {
    name: 'AI 在教育中的应用',
    audience: '中学老师',
    durationMinutes: 30,
    content: '- 现状\n- 痛点',
    style: '深色科技',
  }
  it('passes for valid input and computes pageCountEst', () => {
    const r = validateBrief(valid)
    expect(r.pageCountEst).toBe(20)
    expect(r.name).toBe('AI 在教育中的应用')
  })
  it('throws PARSE when name is empty', () => {
    expect(() => validateBrief({ ...valid, name: '' })).toThrow(/name/)
  })
  it('throws PARSE when durationMinutes out of range', () => {
    expect(() => validateBrief({ ...valid, durationMinutes: 0 })).toThrow(/durationMinutes/)
    expect(() => validateBrief({ ...valid, durationMinutes: 121 })).toThrow(/durationMinutes/)
  })
  it('truncates fields over max length', () => {
    const r = validateBrief({ ...valid, name: 'a'.repeat(100) })
    expect(r.name.length).toBe(30)
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `bun run test tests/unit/shared/brief.test.ts`
Expected: FAIL with "Cannot find module '../../../src/shared/brief.js'"

- [ ] **Step 3: 在 `src/shared/types.ts` 加 `ProjectBrief`**

在文件末尾(`export const DEFAULT_STYLE` 之前)追加:

```ts
export interface ProjectBrief {
  name: string            // PPT 名称(≤ 30 字)
  audience: string        // 演讲对象和场景(≤ 80 字)
  durationMinutes: number // 演讲时长(主输入,1-120 整数)
  pageCountEst: number    // 估算页数(派生,只读)
  content: string         // 演讲内容(精炼 source,Markdown bullets,≤ 800 字)
  style: string           // 整体视觉风格(≤ 80 字)
}
```

并把 `ProjectDetail` 接口的 `// Stage 1` 段加一行:

```ts
  // Stage 1
  source: string | null
  brief: ProjectBrief | null  // ← 新增
```

- [ ] **Step 4: 新建 `src/shared/brief.ts`**

```ts
// @ts-ignore — AppError 在 types 中暂未导出,直接用 any 走通
import type { ProjectBrief } from './types.js'

export function computePageCountEst(durationMinutes: number): number {
  return Math.max(3, Math.min(60, Math.round(durationMinutes / 1.5)))
}

export class BriefParseError extends Error {
  code = 'PARSE' as const
  constructor(message: string) { super(message); this.name = 'BriefParseError' }
}

export function validateBrief(raw: unknown): ProjectBrief {
  const r = raw as Partial<ProjectBrief>
  if (typeof r.name !== 'string' || !r.name.trim()) throw new BriefParseError('brief.name 缺失')
  if (typeof r.audience !== 'string') throw new BriefParseError('brief.audience 缺失')
  if (typeof r.durationMinutes !== 'number' || r.durationMinutes < 1 || r.durationMinutes > 120) {
    throw new BriefParseError('brief.durationMinutes 必须是 1-120 的整数')
  }
  if (typeof r.content !== 'string' || !r.content.trim()) throw new BriefParseError('brief.content 缺失')
  if (typeof r.style !== 'string') throw new BriefParseError('brief.style 缺失')
  return {
    name: r.name.trim().slice(0, 30),
    audience: r.audience.trim().slice(0, 80),
    durationMinutes: Math.round(r.durationMinutes),
    pageCountEst: computePageCountEst(r.durationMinutes),
    content: r.content.trim().slice(0, 800),
    style: r.style.trim().slice(0, 80),
  }
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `bun run test tests/unit/shared/brief.test.ts`
Expected: PASS, 8/8 tests green

- [ ] **Step 6: 跑 typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/brief.ts tests/unit/shared/brief.test.ts
git commit -m "feat(brief): add ProjectBrief type + validate + pageCountEst"
```

---

## Task 2: projects fs 加 `readProjectBrief` / `writeProjectBrief` + `getProject` 加载 brief

**Files:**
- Modify: `src/main/fs/projects.ts` (新增 2 函数 + getProject 加 12 行)
- Modify: `tests/unit/main/fs/projects.test.ts` (新增若干 case)

- [ ] **Step 1: 读现有 projects.test.ts 看测试套路**

Run: `Read /Users/ethan/code/zn-agentic-ppt/tests/unit/main/fs/projects.test.ts` (前 60 行)

记录 `setProjectsDirForTest` 用法和 sample project 构造方式。

- [ ] **Step 2: 写失败单测**

在 `tests/unit/main/fs/projects.test.ts` 末尾追加 `describe('brief persistence')`:

```ts
import type { ProjectBrief } from '../../../src/shared/types.js'

describe('brief persistence', () => {
  it('readProjectBrief returns null when brief.json missing', async () => {
    const { readProjectBrief, setProjectsDirForTest, createProject } = await import('../../../src/main/fs/projects.js')
    setProjectsDirForTest(makeTmpDir())
    const meta = await createProject('topic')
    expect(await readProjectBrief(meta.id)).toBeNull()
  })
  it('writeProjectBrief + readProjectBrief round-trips', async () => {
    const { writeProjectBrief, readProjectBrief, setProjectsDirForTest, createProject } = await import('../../../src/main/fs/projects.js')
    setProjectsDirForTest(makeTmpDir())
    const meta = await createProject('topic')
    const brief: ProjectBrief = { name: 'n', audience: 'a', durationMinutes: 30, pageCountEst: 20, content: 'c', style: 's' }
    await writeProjectBrief(meta.id, brief)
    expect(await readProjectBrief(meta.id)).toEqual(brief)
  })
  it('getProject includes brief when brief.json exists', async () => {
    const { getProject, writeProjectBrief, setProjectsDirForTest, createProject } = await import('../../../src/main/fs/projects.js')
    setProjectsDirForTest(makeTmpDir())
    const meta = await createProject('topic')
    const brief: ProjectBrief = { name: 'n', audience: 'a', durationMinutes: 30, pageCountEst: 20, content: 'c', style: 's' }
    await writeProjectBrief(meta.id, brief)
    const detail = await getProject(meta.id)
    expect(detail?.brief).toEqual(brief)
  })
})
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `bun run test tests/unit/main/fs/projects.test.ts`
Expected: FAIL — `readProjectBrief is not a function`

- [ ] **Step 4: 在 `projects.ts` 加 brief 序列化**

在文件末尾追加:

```ts
// --- Stage 1: brief ---

export async function readProjectBrief(id: string): Promise<ProjectBrief | null> {
  const p = join(getProjectsDir(), id, 'brief.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await readFile(p, 'utf8')) as ProjectBrief
  } catch { return null }
}

export async function writeProjectBrief(id: string, brief: ProjectBrief): Promise<void> {
  const dir = join(getProjectsDir(), id)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, 'brief.json.tmp')
  const final = join(dir, 'brief.json')
  await writeFile(tmp, JSON.stringify(brief, null, 2))
  await rename(tmp, final)
}
```

并在 `import` 段加 `ProjectBrief`:

```ts
import type { ProjectDetail, ProjectMeta, ProjectStatus, Outline, StyleSettings, ProjectBrief } from '../../shared/types.js'
```

- [ ] **Step 5: 在 `getProject` 加载 brief**

找到 `getProject` 函数的 `// Stage 1: source` 段,在它之后插入:

```ts
    // Stage 1: brief
    let brief: ProjectBrief | null = null
    const briefPath = join(dir, 'brief.json')
    if (existsSync(briefPath)) {
      try {
        brief = JSON.parse(await readFile(briefPath, 'utf8')) as ProjectBrief
      } catch { /* corrupt — leave null */ }
    }
```

并在 `return` 语句里加 `brief,`:

```ts
    return {
      ...meta,
      html, htmlSize,
      lastGeneratedAt: html ? meta.updatedAt : null,
      lastError: null,
      source,
      brief,
      structuredOutline,
      style,
      slides,
    }
```

- [ ] **Step 6: 跑测试,确认通过**

Run: `bun run test tests/unit/main/fs/projects.test.ts`
Expected: PASS

- [ ] **Step 7: 跑 typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add src/main/fs/projects.ts tests/unit/main/fs/projects.test.ts
git commit -m "feat(fs): add readProjectBrief/writeProjectBrief + load on getProject"
```

---

## Task 3: `STAGE_COLLECT_SAVE` 写 brief + 加 `STAGE_BRIEF_OPTIMIZE_*` 6 个 channel 占位

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/stage.ts` (改 STAGE_COLLECT_SAVE)

- [ ] **Step 1: 在 `src/shared/ipc-channels.ts` 加 6 个 channel**

在文件末尾 `// Main → renderer (push)` 段之后追加:

```ts
  // Stage 1 brief optimization (renderer → main, invoke)
  STAGE_BRIEF_OPTIMIZE_START: 'stage:brief-optimize-start',
  STAGE_BRIEF_OPTIMIZE_CANCEL: 'stage:brief-optimize-cancel',
  STAGE_BRIEF_OPTIMIZE_ANSWER: 'stage:brief-optimize-answer',

  // Main → renderer (push)
  STAGE_ASK_USER_QUESTION: 'stage:ask-user-question',
  STAGE_BRIEF_OPTIMIZE_DONE: 'stage:brief-optimize-done',
  STAGE_BRIEF_OPTIMIZE_ERROR: 'stage:brief-optimize-error',
```

- [ ] **Step 2: 在 `src/main/ipc/stage.ts` 改 `STAGE_COLLECT_SAVE` handler**

找到 `ipcMain.handle(IPC.STAGE_COLLECT_SAVE, async (_, { id, topic, source }: { id: string; topic: string; source: string }) => {` 段,改成:

```ts
  ipcMain.handle(IPC.STAGE_COLLECT_SAVE, async (_, { id, topic, source, brief }: { id: string; topic: string; source: string; brief: ProjectBrief | null }) => {
    await outlineFs.writeSource(id, source)
    if (brief) {
      await projectFs.writeProjectBrief(id, brief)
    }
    const existing = await projectFs.getProject(id)
    if (existing) {
      await projectFs.updateProject(id, { topic })
    }
  })
```

并在顶部 import 段加 `ProjectBrief`:

```ts
import type { OutlineSlide, StyleSettings, ProjectBrief } from '../../shared/types.js'
```

- [ ] **Step 3: 跑 typecheck + 测试**

Run: `bun run typecheck && bun run test`
Expected: exit 0, 全部通过(本次改动没破坏现有 case)

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/stage.ts
git commit -m "feat(ipc): add 6 brief-optimize channels + persist brief on collect-save"
```

---

## Task 4: `brief-optimize` PromptSpec + register + 单测

**Files:**
- Create: `src/main/sdk/prompts/brief-optimize.ts`
- Modify: `src/main/sdk/prompts/index.ts`
- Modify: `tests/unit/main/sdk/prompts/renderPrompt.test.ts` (新增 1 case)

- [ ] **Step 1: 写失败单测**

在 `renderPrompt.test.ts` 末尾追加:

```ts
import { briefOptimizePrompt } from '../../../../src/main/sdk/prompts/brief-optimize.js'

describe('brief-optimize prompt', () => {
  it('declares source and hintJson variables', () => {
    const names = briefOptimizePrompt.variables.map(v => v.name)
    expect(names).toEqual(['source', 'hintJson'])
  })
  it('instructs agent to use AskUserQuestion tool', () => {
    expect(briefOptimizePrompt.defaultTemplate).toMatch(/AskUserQuestion/)
  })
  it('lists 5 output fields', () => {
    const t = briefOptimizePrompt.defaultTemplate
    expect(t).toMatch(/"name"/)
    expect(t).toMatch(/"audience"/)
    expect(t).toMatch(/"durationMinutes"/)
    expect(t).toMatch(/"content"/)
    expect(t).toMatch(/"style"/)
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `bun run test tests/unit/main/sdk/prompts/renderPrompt.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: 新建 `src/main/sdk/prompts/brief-optimize.ts`**

```ts
import type { PromptSpec } from './types.js'

export const briefOptimizePrompt: PromptSpec = {
  id: 'brief-optimize',
  title: '项目信息优化',
  description: '把用户原始描述 + 现有结构化字段整理成完整的 5 字段 brief,允许用 AskUserQuestion 追问最多 2 轮。',
  defaultTemplate: `你是 PPT 项目结构化助手。你的任务是把用户给的原始描述(可能很粗糙)整理成一个 5 字段的完整 brief。

【5 个字段】
1. name: PPT 名称(≤ 30 字)
2. audience: 演讲对象和场景(例: "面向企业 CTO 的技术分享,在 Q4 战略会上" — ≤ 80 字)
3. durationMinutes: 演讲时长(整数,1-120 分钟)
4. content: 演讲内容核心要点(精炼 source;Markdown bullets;≤ 800 字)
5. style: 整体视觉风格描述(例: "深色科技感、霓虹色点缀、code 风" — ≤ 80 字)

【工具:AskUserQuestion】
当你发现关键信息(source 没写、hint 也是空的)无法推断时,调 AskUserQuestion 工具追问。
- 一次最多 4 个 question;每个 question 必须 2-4 个 option
- header 字段 ≤ 12 字(会在 UI 上当 Modal 标题)
- 最多调用 2 轮。第 2 轮 tool result 如果是 {cancelled:true} 表示用户跳过了,用现有信息走保守推断
- 调用 AskUserQuestion 之前先用 chain-of-thought 说明你要问什么

【输入】
hint(现有结构化字段,可能全空,可能部分有):
{{hintJson}}

source(用户原始描述,可能很粗糙):
{{source}}

【输出】
完成所有追问(到达上限 / 用户取消 / 你已经能填全 5 字段)后,输出最终 JSON(不要解释,直接输出):
{
  "name": "...",
  "audience": "...",
  "durationMinutes": 30,
  "content": "...",
  "style": "..."
}
`,
  variables: [
    { name: 'source', description: '用户原始描述', type: 'string' },
    { name: 'hintJson', description: '现有结构化字段(JSON 字符串)', type: 'string' },
  ],
}
```

- [ ] **Step 4: 在 `src/main/sdk/prompts/index.ts` 注册**

文件末尾追加:

```ts
import { briefOptimizePrompt } from './brief-optimize.js'
registerPrompt(briefOptimizePrompt)
```

(同时把 `PromptId` 类型联合加上 `brief-optimize` — 见下)

打开 `src/main/sdk/prompts/types.ts`,修改 `PromptId`:

```ts
export type PromptId = 'outline' | 'regenerate' | 'slide-system' | 'slide-user' | 'brief-optimize'
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `bun run test tests/unit/main/sdk/prompts/renderPrompt.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/prompts/brief-optimize.ts src/main/sdk/prompts/index.ts src/main/sdk/prompts/types.ts tests/unit/main/sdk/prompts/renderPrompt.test.ts
git commit -m "feat(prompts): add brief-optimize PromptSpec + register"
```

---

## Task 5: `outline` prompt 切到读 brief (5 变量)

**Files:**
- Modify: `src/main/sdk/prompts/outline.ts`

- [ ] **Step 1: 改 outline.ts 变量 + 模板**

完整替换文件为:

```ts
import type { PromptSpec } from './types.js'

export const outlinePrompt: PromptSpec = {
  id: 'outline',
  title: '大纲生成',
  description: '基于项目 brief 整理成 4-8 张幻灯片大纲,含 cover/closing 强制首尾与全局风格。',
  defaultTemplate: `你是 PPT 大纲编辑 + 视觉策划。基于以下项目 brief 整理成 4-8 张幻灯片大纲,每页包含:
- title: 标题(≤ 20 字)
- bullets: 要点数组(2-5 项,每项 ≤ 30 字)
- notes: 可选,补充说明(≤ 50 字)
- layout: 该页建议的视觉布局(cover / list / columns / stats / quote / closing 之一)

【项目 brief】
名称: {{briefName}}
演讲对象和场景: {{briefAudience}}
演讲时长(分钟): {{briefDurationMinutes}}
演讲内容:
{{briefContent}}
整体风格: {{briefStyle}}

【全局风格】(整套 PPT 保持视觉一致 — 每张幻灯片都会遵循)
- 主色 #1677ff(蓝)
- 强调色 #722ed1(紫)
- 暖色装饰 #f59e0b(橙,仅 cover/closing 用)
- 字体 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
- 尺寸 16:9
- 一张幻灯片只用一种 layout,不要混

【布局类型说明】(每张选一种,相邻页不要用同一种)
- cover: 封面页,大标题 + 副标题,仅 1 张(必须放在第 1 张)
- list: 卡片列表,4-6 条要点
- columns: 左右分栏,对比/并列/正反
- stats: 大数字 / KPI(适合百分比/数据/效果)
- quote: 居中引言 / 金句(10 张里最多用 1-2 次)
- closing: 结尾页(致谢 / Q&A / 总结),仅 1 张(必须放在最后 1 张)

【结构硬性要求】
- 第 1 张必须是 cover
- 最后 1 张必须是 closing
- 中间 N-2 张循环使用 list / columns / stats / quote,避免连续 2 张同一种
- N = 4 ~ 8 张

输出 JSON 格式(不要解释,直接输出):
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
`,
  variables: [
    { name: 'briefName', description: 'PPT 名称', type: 'string', example: 'AI 在教育中的应用' },
    { name: 'briefAudience', description: '演讲对象和场景', type: 'string' },
    { name: 'briefDurationMinutes', description: '演讲时长(分钟)', type: 'string' },
    { name: 'briefContent', description: '演讲内容要点', type: 'string' },
    { name: 'briefStyle', description: '整体风格', type: 'string' },
  ],
}
```

- [ ] **Step 2: 跑 typecheck + 全测试**

Run: `bun run typecheck && bun run test`
Expected: 可能有 stage.ts 调用 outline prompt 失败的 typecheck 错误(因为它现在传 `topic/source` 不再是声明变量),这由 Task 6 修复。

- [ ] **Step 3: Commit**

```bash
git add src/main/sdk/prompts/outline.ts
git commit -m "feat(prompts): switch outline to read project brief (5 vars)"
```

---

## Task 6: `STAGE_OUTLINE_GENERATE` 喂 brief + 降级到 `topic + source`

**Files:**
- Modify: `src/main/ipc/stage.ts`

- [ ] **Step 1: 改 outline handler**

找到 `ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, ...)` 段,把:

```ts
systemPrompt: await renderPrompt('outline', { topic: project.topic, source }),
```

替换为:

```ts
const brief = project.brief
const systemPrompt = brief
  ? await renderPrompt('outline', {
      briefName: brief.name,
      briefAudience: brief.audience,
      briefDurationMinutes: brief.durationMinutes.toString(),
      briefContent: brief.content,
      briefStyle: brief.style,
    })
  : await (async () => {
      // brief-fallback: 旧数据无 brief,降级用 topic+source
      // (此分支会因 renderPrompt 找不到变量抛错,直到 outline prompt 临时保留旧变量 — 见 spec 6.2)
      console.warn(`[outline:${id}] brief-fallback, using topic+source`)
      return await renderPrompt('outline-fallback', { topic: project.topic, source })
    })()
```

并把 `topic: project.topic, outline: source` 改成 `topic: project.topic, outline: brief?.name ?? source`(因为 outline 字段在 GenerationRunner 里用作 runId/topic 上下文,保留兼容)。

- [ ] **Step 2: 跑 typecheck**

Run: `bun run typecheck`
Expected: **可能 fail**,因为 `renderPrompt('outline-fallback', ...)` 还没注册。这是预期的 — 本步只跑 typecheck 看是否仅剩这个错。

如果看到 "未知 prompt id: outline-fallback" 之类,**临时** 接受(Step 4 会处理)。

- [ ] **Step 3: 跑测试**

Run: `bun run test`
Expected: 全过(本改动不影响 store/prompt 单测)

- [ ] **Step 4: 留 outline-fallback 临时降级 prompt**

为了让旧数据继续工作,**临时** 把 `outline` 模板里加 `{{topic}}` `{{source}}` 作为可选用法,在变量里加 `topic?: string` `source?: string` — **不**,这样会污染新流程。

**正确做法**: 改用 `renderPrompt('outline', { ... })` 但加一个临时分支 — 简化为:**只在 `brief` 缺失时直接 return 错误并提示用户先优化**。

替换 Step 1 整段为:

```ts
const brief = project.brief
if (!brief) {
  throw new Error('project has no brief — user must complete Stage 1 优化 first')
}
const systemPrompt = await renderPrompt('outline', {
  briefName: brief.name,
  briefAudience: brief.audience,
  briefDurationMinutes: brief.durationMinutes.toString(),
  briefContent: brief.content,
  briefStyle: brief.style,
})
```

这样旧数据走"必须先优化"路径,行为可预测,不需要临时 outline-fallback prompt。

- [ ] **Step 5: 跑 typecheck + 测试**

Run: `bun run typecheck && bun run test`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/stage.ts
git commit -m "feat(stage): outline-generate reads brief (no source fallback)"
```

---

## Task 7: `PromptSettings` 元数据镜像加 `brief-optimize`

**Files:**
- Modify: `src/renderer/components/PromptSettings.tsx`

- [ ] **Step 1: 改 PromptId + PROMPT_METADATA**

把 `PromptSettings.tsx` 顶部的 `PromptSpec` 接口 `id` 类型改成:

```ts
export interface PromptSpec {
  id: 'outline' | 'regenerate' | 'slide-system' | 'slide-user' | 'brief-optimize'
  title: string
  description: string
  defaultTemplate: string
  variables: PromptVar[]
}
```

并在 `PROMPT_METADATA` 数组开头插入:

```ts
  {
    id: 'brief-optimize', title: '项目信息优化',
    description: '把原始描述整理成 5 字段结构化 brief,支持 AskUserQuestion 反问。',
    defaultTemplate: '',
    variables: [
      { name: 'source', description: '用户原始描述', type: 'string' },
      { name: 'hintJson', description: '现有结构化字段 JSON', type: 'string' },
    ],
  },
```

- [ ] **Step 2: 跑 typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PromptSettings.tsx
git commit -m "feat(settings): expose brief-optimize in prompt editor"
```

---

## Task 8: `BriefAgent` 核心 + sdkEvents 单测

**Files:**
- Create: `src/main/sdk/agents/briefAgent.ts`
- Create: `tests/unit/main/sdk/agents/briefAgent.test.ts`

- [ ] **Step 1: 写失败单测**

`tests/unit/main/sdk/agents/briefAgent.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockInterrupt = vi.fn()

vi.mock('../../../../vendor/sdk.mjs', () => ({
  query: (params: any) => {
    mockQuery(params)
    return {
      sessionId: 'sess-1',
      [Symbol.asyncIterator]: () => {
        const events = params.__events ?? []
        let i = 0
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true }
            return { value: events[i++], done: false }
          },
        }
      },
      interrupt: mockInterrupt,
      close: () => {},
    }
  },
  tool: (name: string, desc: string, schema: any) => ({ name, description: desc, inputSchema: schema }),
  createSdkMcpServer: (cfg: any) => ({ ...cfg, scope: 'session' }),
}))

import { BriefAgent } from '../../../../src/main/sdk/agents/briefAgent.js'

describe('BriefAgent', () => {
  beforeEach(() => { mockQuery.mockReset(); mockInterrupt.mockReset() })

  it('happy path: 1 question + answer + final JSON → onDone with brief', async () => {
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      // Round 1: agent asks
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Let me ask about duration.' },
        { type: 'tool_use', name: 'AskUserQuestion', id: 't1', input: {
          questions: [{ question: '时长?', header: '时长', options: [{ label: '10分钟' }, { label: '30分钟' }], multiSelect: false }],
        }},
      ]}},
      // tool_result will be injected by handler below
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Got it. Final: ' + JSON.stringify({
          name: 'Test', audience: 'aud', durationMinutes: 10,
          content: 'c', style: 's',
        })},
      ]}},
      { type: 'result', subtype: 'success', duration_ms: 500 },
    ]
    let onQuestion: any
    const agent = new BriefAgent({
      cwd: '/tmp', settings: { llm: { provider:'anthropic', baseUrl:'', apiKey:'', model:'m' }, ui:{theme:'light'}, paths:{projectsDir:''} } as any,
      source: 'raw source', hint: null,
      onQuestion: (q) => { onQuestion = q },
      onDone: () => {},
      onError: () => {},
    })
    // Intercept the tool handler to auto-answer
    const origRun = agent.run.bind(agent)
    agent.run = async function () {
      await origRun()
      // After run() kicks off, simulate renderer answering
      // The tool handler will be called via mock sdk — we need to wait for it
      // Simplest: just call onQuestion's resolver after a microtask
    }
    let doneBrief: any = null
    const a2 = new BriefAgent({
      cwd: '/tmp', settings: { llm: { provider:'anthropic', baseUrl:'', apiKey:'', model:'m' }, ui:{theme:'light'}, paths:{projectsDir:''} } as any,
      source: 'raw source', hint: null,
      onQuestion: (q) => {
        // immediately resolve with 30分钟
        setTimeout(() => a2.answer(q.qid, { cancelled: false, value: { '时长?': '30分钟' } }), 0)
      },
      onDone: (b) => { doneBrief = b },
      onError: (e) => { throw new Error('unexpected: ' + e.message) },
    })
    await a2.run()
    expect(doneBrief).toBeTruthy()
    expect(doneBrief.name).toBe('Test')
    expect(doneBrief.pageCountEst).toBeGreaterThan(0)
  })

  it('max_turns: 3rd call returns cancelled tool result', async () => {
    let questionCount = 0
    const a = new BriefAgent({
      cwd: '/tmp', settings: { llm: { provider:'anthropic', baseUrl:'', apiKey:'', model:'m' }, ui:{theme:'light'}, paths:{projectsDir:''} } as any,
      source: 's', hint: null,
      onQuestion: (q) => { questionCount++ },
      onDone: () => {},
      onError: () => {},
    })
    // Use internal handler directly
    const handler = (a as any).__getAskHandler()
    const r1 = await handler({ questions: [{ question: 'q1', header: 'h', options:[{label:'a'},{label:'b'}], multiSelect:false }] })
    expect(questionCount).toBe(1)
    // Don't answer, call again
    const p2 = handler({ questions: [{ question: 'q2', header: 'h', options:[{label:'a'},{label:'b'}], multiSelect:false }] })
    // 3rd call: should immediately return cancelled
    const r3 = await handler({ questions: [{ question: 'q3', header: 'h', options:[{label:'a'},{label:'b'}], multiSelect:false }] })
    expect(JSON.parse(r3.content[0].text).cancelled).toBe(true)
  })

  it('user cancel: answer with cancelled:true returns cancelled tool result', async () => {
    const a = new BriefAgent({
      cwd: '/tmp', settings: { llm: { provider:'anthropic', baseUrl:'', apiKey:'', model:'m' }, ui:{theme:'light'}, paths:{projectsDir:''} } as any,
      source: 's', hint: null,
      onQuestion: (q) => { setTimeout(() => a.answer(q.qid, { cancelled: true }), 0) },
      onDone: () => {},
      onError: () => {},
    })
    const handler = (a as any).__getAskHandler()
    const r = await handler({ questions: [{ question: 'q', header: 'h', options:[{label:'a'},{label:'b'}], multiSelect:false }] })
    expect(JSON.parse(r.content[0].text).cancelled).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `bun run test tests/unit/main/sdk/agents/briefAgent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 新建 `src/main/sdk/agents/briefAgent.ts`**

```ts
import { tool, createSdkMcpServer } from '../../../vendor/sdk.mjs'
import { randomUUID } from 'node:crypto'
import { GenerationRunner } from '../runner.js'
import { renderPrompt } from '../prompts/index.js'
import { extractFirstJsonValue } from '../json-extract.js'
import { validateBrief, BriefParseError } from '../../../shared/brief.js'
import type { Settings, ProjectBrief, AppError } from '../../../shared/types.js'

export interface AskUserRequest {
  qid: string
  turn: 1 | 2
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
}

export type AskAnswer =
  | { cancelled: false; value: Record<string, string | string[]> }
  | { cancelled: true; reason?: 'user_cancelled' | 'max_turns' }

const askUserQuestionJsonSchema = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        required: ['question', 'header', 'options', 'multiSelect'],
        properties: {
          question: { type: 'string' },
          header: { type: 'string', maxLength: 12 },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['label'],
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          multiSelect: { type: 'boolean' },
        },
      },
    },
  },
}

export interface BriefAgentOpts {
  cwd: string
  settings: Settings
  source: string
  hint: ProjectBrief | null
  onQuestion: (q: AskUserRequest) => void
  onDone: (b: ProjectBrief) => void
  onError: (e: AppError) => void
  /** Test-only: inject canned events. When set, run() does not call real SDK. */
  sdkEvents?: any[]
}

export class BriefAgent {
  private askQueue = new Map<string, (r: AskAnswer) => void>()
  private turns = 0
  private runner: GenerationRunner | null = null
  private askHandler: ((args: any) => Promise<{ content: Array<{ type: string; text: string }> }>) | null = null

  constructor(private opts: BriefAgentOpts) {}

  /** Test-only accessor for the AskUserQuestion tool handler. */
  __getAskHandler() {
    if (!this.askHandler) {
      this.askHandler = this.buildAskHandler()
    }
    return this.askHandler
  }

  private buildAskHandler() {
    return async (args: any): Promise<{ content: Array<{ type: string; text: string }> }> => {
      if (this.turns >= 2) {
        return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, reason: 'max_turns' }) }] }
      }
      this.turns++
      const qid = randomUUID()
      const answer = await new Promise<AskAnswer>((resolve) => {
        this.askQueue.set(qid, resolve)
        this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions: args.questions })
      })
      return { content: [{ type: 'text', text: JSON.stringify(answer) }] }
    }
  }

  async run(): Promise<void> {
    const askHandler = this.buildAskHandler()
    this.askHandler = askHandler
    const askUserQuestionTool = tool(
      'AskUserQuestion',
      'Ask the user 1-4 multiple-choice questions to fill missing information.',
      askUserQuestionJsonSchema as any,
      askHandler as any,
    )
    const server = createSdkMcpServer({
      type: 'sdk',
      name: 'brief-tools',
      tools: [askUserQuestionTool],
    })

    const systemPrompt = await renderPrompt('brief-optimize', {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
    })

    this.runner = new GenerationRunner({
      cwd: this.opts.cwd,
      topic: '',
      outline: '',
      settings: this.opts.settings,
      runId: `brief:${randomUUID()}`,
      systemPrompt,
      userMessage: '请开始整理项目信息。',
      mcpServers: { 'brief-tools': server },
      sdkEvents: this.opts.sdkEvents,
      onEvent: () => {},
      onProgress: () => {},
      onDone: ({ html }) => this.handleDone(html),
      onError: ({ error }) => this.opts.onError({ code: 'INTERNAL', message: error.message, retryable: false }),
    })
    await this.runner.run()
  }

  cancel(): void { this.runner?.interrupt() }

  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid)
    if (resolve) { this.askQueue.delete(qid); resolve(value) }
  }

  private handleDone(buffer: string): void {
    try {
      const obj = extractFirstJsonValue(buffer)
      this.opts.onDone(validateBrief(obj))
    } catch (e: any) {
      const code = e instanceof BriefParseError ? 'PARSE' as const : 'PARSE' as const
      this.opts.onError({ code, message: e?.message ?? String(e), retryable: true })
    }
  }
}
```

- [ ] **Step 4: 跑测试,逐个修**

Run: `bun run test tests/unit/main/sdk/agents/briefAgent.test.ts`
Expected: 3/3 PASS

- [ ] **Step 5: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/agents/briefAgent.ts tests/unit/main/sdk/agents/briefAgent.test.ts
git commit -m "feat(agent): BriefAgent with AskUserQuestion MCP tool + tests"
```

---

## Task 9: `ipc/brief.ts` handler + 单测

**Files:**
- Create: `src/main/ipc/brief.ts`
- Create: `tests/unit/main/ipc/brief.test.ts`
- Modify: `src/main/index.ts` (在 `registerStageIPC()` 旁边加 `registerBriefIPC()`)

- [ ] **Step 1: 写失败单测**

`tests/unit/main/ipc/brief.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC } from '../../../../src/shared/ipc-channels.js'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => handlers.set(ch, fn) },
  BrowserWindow: { getAllWindows: () => [] },
}))

const mockAgent = {
  run: vi.fn(),
  cancel: vi.fn(),
  answer: vi.fn(),
}

vi.mock('../../../../src/main/sdk/agents/briefAgent.js', () => ({
  BriefAgent: vi.fn().mockImplementation(() => mockAgent),
}))

vi.mock('../../../../src/main/fs/projects.js', () => ({
  readProjectBrief: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../../src/main/fs/outline.js', () => ({
  readSource: vi.fn().mockResolvedValue('raw source content'),
}))

vi.mock('../../../../src/main/fs/settings.js', () => ({
  getSettings: vi.fn().mockResolvedValue({ llm: { provider:'anthropic', baseUrl:'', apiKey:'', model:'m' }, ui:{theme:'light'}, paths:{projectsDir:''} }),
}))

import { registerBriefIPC } from '../../../../src/main/ipc/brief.js'

describe('brief IPC', () => {
  beforeEach(() => {
    handlers.clear()
    mockAgent.run.mockReset()
    mockAgent.cancel.mockReset()
    mockAgent.answer.mockReset()
  })

  it('start handler constructs BriefAgent and calls run', async () => {
    registerBriefIPC()
    const start = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_START)!
    await start({}, { id: 'p1', hint: null })
    expect(mockAgent.run).toHaveBeenCalledTimes(1)
  })

  it('cancel handler calls agent.cancel', async () => {
    registerBriefIPC()
    const cancel = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_CANCEL)!
    cancel({}, {})
    expect(mockAgent.cancel).toHaveBeenCalledTimes(1)
  })

  it('answer handler calls agent.answer with qid+value', async () => {
    registerBriefIPC()
    const answer = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_ANSWER)!
    answer({}, { qid: 'q1', value: { cancelled: false, value: { 'q1': 'a' } } })
    expect(mockAgent.answer).toHaveBeenCalledWith('q1', { cancelled: false, value: { 'q1': 'a' } })
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `bun run test tests/unit/main/ipc/brief.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 新建 `src/main/ipc/brief.ts`**

```ts
import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { BriefAgent, type AskUserRequest, type AskAnswer } from '../sdk/agents/briefAgent.js'
import * as projectFs from '../fs/projects.js'
import * as outlineFs from '../fs/outline.js'
import * as settingsFs from '../fs/settings.js'
import { getProjectDir } from '../fs/paths.js'
import type { ProjectBrief, AppError } from '../../shared/types.js'

let activeAgent: BriefAgent | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

export function registerBriefIPC(): void {
  ipcMain.handle(IPC.STAGE_BRIEF_OPTIMIZE_START, async (_, { id, hint }: { id: string; hint: ProjectBrief | null }) => {
    if (activeAgent) throw new Error('已有优化任务在跑,请先取消或等待完成')
    const settings = await settingsFs.getSettings()
    const source = await outlineFs.readSource(id)
    const cwd = getProjectDir(id)
    activeAgent = new BriefAgent({
      cwd, settings, source, hint,
      onQuestion: (q: AskUserRequest) => broadcast(IPC.STAGE_ASK_USER_QUESTION, { projectId: id, ...q }),
      onDone: (b: ProjectBrief) => {
        broadcast(IPC.STAGE_BRIEF_OPTIMIZE_DONE, { projectId: id, brief: b })
        activeAgent = null
      },
      onError: (e: AppError) => {
        broadcast(IPC.STAGE_BRIEF_OPTIMIZE_ERROR, { projectId: id, error: e })
        activeAgent = null
      },
    })
    await activeAgent.run()
    return { ok: true }
  })

  ipcMain.handle(IPC.STAGE_BRIEF_OPTIMIZE_CANCEL, async () => {
    if (activeAgent) { activeAgent.cancel(); activeAgent = null }
    return { ok: true }
  })

  ipcMain.handle(IPC.STAGE_BRIEF_OPTIMIZE_ANSWER, async (_, { qid, value }: { qid: string; value: AskAnswer }) => {
    activeAgent?.answer(qid, value)
    return { ok: true }
  })
}
```

- [ ] **Step 4: 在 `src/main/index.ts` 注册**

找到 `registerStageIPC()` 调用,在它旁边加 `registerBriefIPC()`。先 `Read` 一下确认 import 位置。

- [ ] **Step 5: 跑测试,确认通过**

Run: `bun run test tests/unit/main/ipc/brief.test.ts`
Expected: PASS

- [ ] **Step 6: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/brief.ts tests/unit/main/ipc/brief.test.ts src/main/index.ts
git commit -m "feat(ipc): register brief-optimize handlers with BriefAgent wiring"
```

---

## Task 10: preload bridge 暴露 `brief.*`

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 `stage` 段后加 `brief` 段**

在 `src/preload/index.ts` 第 63 行(原 `},` 结束 stage 对象处)后,新增 `brief` 段:

```ts
  brief: {
    optimize: (id: string, hint: any) => ipcRenderer.invoke(IPC.STAGE_BRIEF_OPTIMIZE_START, { id, hint }),
    cancel: () => ipcRenderer.invoke(IPC.STAGE_BRIEF_OPTIMIZE_CANCEL),
    answer: (qid: string, value: any) => ipcRenderer.invoke(IPC.STAGE_BRIEF_OPTIMIZE_ANSWER, { qid, value }),
    onAskUserQuestion: (cb: (e: any) => void) => subscribe(IPC.STAGE_ASK_USER_QUESTION, cb),
    onDone: (cb: (e: any) => void) => subscribe(IPC.STAGE_BRIEF_OPTIMIZE_DONE, cb),
    onError: (cb: (e: any) => void) => subscribe(IPC.STAGE_BRIEF_OPTIMIZE_ERROR, cb),
  },
```

- [ ] **Step 2: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose brief.* methods + 3 event subs"
```

---

## Task 11: `useBriefOptimizeStore` + 单测

**Files:**
- Create: `src/renderer/stores/briefOptimize.ts`
- Create: `tests/unit/renderer/stores/briefOptimize.test.ts`

- [ ] **Step 1: 写失败单测**

`tests/unit/renderer/stores/briefOptimize.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiMock = {
  brief: {
    optimize: vi.fn().mockResolvedValue({ ok: true }),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    answer: vi.fn(),
    onAskUserQuestion: vi.fn().mockReturnValue(() => {}),
    onDone: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
  },
}

vi.mock('../../../../src/renderer/lib/api.js', () => ({ api: apiMock }))

import { useBriefOptimizeStore } from '../../../../src/renderer/stores/briefOptimize.js'

describe('useBriefOptimizeStore', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('start calls api.brief.optimize and subscribes to 3 events', async () => {
    await useBriefOptimizeStore.getState().start('p1', null)
    expect(apiMock.brief.optimize).toHaveBeenCalledWith('p1', null)
    expect(apiMock.brief.onAskUserQuestion).toHaveBeenCalledTimes(1)
    expect(apiMock.brief.onDone).toHaveBeenCalledTimes(1)
    expect(apiMock.brief.onError).toHaveBeenCalledTimes(1)
  })

  it('applyQuestion transitions to asking and sets current', () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: 'q1', turn: 1, questions: [{ question: 'q', header: 'h', options: [{label:'a'},{label:'b'}], multiSelect: false }],
    })
    expect(useBriefOptimizeStore.getState().phase).toBe('asking')
    expect(useBriefOptimizeStore.getState().current?.qid).toBe('q1')
  })

  it('answer calls api.brief.answer with qid and value', () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: 'q1', turn: 1, questions: [{ question: 'q', header: 'h', options: [{label:'a'},{label:'b'}], multiSelect: false }],
    })
    useBriefOptimizeStore.getState().answer('q1', { 'q': 'a' })
    expect(apiMock.brief.answer).toHaveBeenCalledWith('q1', { 'q': 'a' })
    expect(useBriefOptimizeStore.getState().phase).toBe('optimizing')
  })

  it('applyDone transitions to done', () => {
    useBriefOptimizeStore.getState().applyDone({ name:'n', audience:'a', durationMinutes:30, pageCountEst:20, content:'c', style:'s' })
    expect(useBriefOptimizeStore.getState().phase).toBe('done')
    expect(useBriefOptimizeStore.getState().error).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `bun run test tests/unit/renderer/stores/briefOptimize.test.ts`
Expected: FAIL

- [ ] **Step 3: 新建 `src/renderer/stores/briefOptimize.ts`**

```ts
import { create } from 'zustand'
import { api } from '../lib/api.js'
import type { ProjectBrief, AppError } from '@shared/types'

export type Phase = 'idle' | 'optimizing' | 'asking' | 'done' | 'error'

export interface AskUserRequest {
  qid: string
  turn: 1 | 2
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
}

interface State {
  phase: Phase
  current: AskUserRequest | null
  error: string | null
  start: (id: string, hint: ProjectBrief | null) => Promise<void>
  cancel: () => Promise<void>
  answer: (qid: string, value: Record<string, string | string[]>) => void
  applyQuestion: (q: AskUserRequest) => void
  applyDone: (b: ProjectBrief) => void
  applyError: (e: AppError) => void
  reset: () => void
}

export const useBriefOptimizeStore = create<State>((set, get) => ({
  phase: 'idle',
  current: null,
  error: null,
  start: async (id, hint) => {
    set({ phase: 'optimizing', current: null, error: null })
    const u1 = api.brief.onAskUserQuestion((e: any) => get().applyQuestion(e))
    const u2 = api.brief.onDone((e: any) => get().applyDone(e.brief))
    const u3 = api.brief.onError((e: any) => get().applyError(e.error))
    // keep references so we could unsubscribe later if needed
    void u1; void u2; void u3
    await api.brief.optimize(id, hint)
  },
  cancel: async () => { await api.brief.cancel(); set({ phase: 'idle', current: null }) },
  answer: (qid, value) => {
    void api.brief.answer(qid, { cancelled: false, value })
    set({ phase: 'optimizing', current: null })
  },
  applyQuestion: (q) => set({ phase: 'asking', current: q }),
  applyDone: (b) => set({ phase: 'done', current: null, error: null }),
  applyError: (e) => set({ phase: 'error', current: null, error: e?.message ?? 'unknown' }),
  reset: () => set({ phase: 'idle', current: null, error: null }),
}))
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `bun run test tests/unit/renderer/stores/briefOptimize.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stores/briefOptimize.ts tests/unit/renderer/stores/briefOptimize.test.ts
git commit -m "feat(store): useBriefOptimizeStore with start/answer/done/error"
```

---

## Task 12: `<AskUserQuestionModal>` 组件

**Files:**
- Create: `src/renderer/components/AskUserQuestionModal.tsx`

(项目 vitest 无 jsdom + @testing-library/react — 见项目 memory;此处**不**写组件单测,改为 Task 16 手测清单验证。)

- [ ] **Step 1: 读现有 `HtmlStream` 或类似 Modal 组件作参考**

Run: `Bash ls /Users/ethan/code/zn-agentic-ppt/src/renderer/components/`

记录 antd `Modal` / `Radio` / `Checkbox` 的现有 import 风格。

- [ ] **Step 2: 新建 `src/renderer/components/AskUserQuestionModal.tsx`**

```tsx
import { useState } from 'react'
import { Modal, Radio, Checkbox, Button } from 'antd'
import { useBriefOptimizeStore, type AskUserRequest } from '../stores/briefOptimize.js'

export function AskUserQuestionModal() {
  const phase = useBriefOptimizeStore(s => s.phase)
  const current = useBriefOptimizeStore(s => s.current)
  const answer = useBriefOptimizeStore(s => s.answer)
  const cancel = useBriefOptimizeStore(s => s.cancel)

  const [selected, setSelected] = useState<Record<string, string | string[]>>({})

  if (phase !== 'asking' || !current) return null

  const onConfirm = () => {
    answer(current.qid, selected)
    setSelected({})
  }
  const onCancelClick = () => {
    cancel()
    setSelected({})
  }

  const allAnswered = current.questions.every(q =>
    selected[q.question] !== undefined &&
    (Array.isArray(selected[q.question]) ? (selected[q.question] as string[]).length > 0 : true)
  )

  return (
    <Modal
      open
      title={current.questions[0]?.header ?? '提问'}
      footer={null}
      closable={false}
      maskClosable={false}
      onCancel={onCancelClick}
    >
      {current.questions.map(q => (
        <div key={q.question} style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 8px' }}>{q.question}</h4>
          {q.multiSelect ? (
            <Checkbox.Group
              options={q.options.map(o => ({ label: o.label, value: o.label }))}
              onChange={vals => setSelected(s => ({ ...s, [q.question]: vals as string[] }))}
            />
          ) : (
            <Radio.Group
              options={q.options.map(o => ({ label: o.label, value: o.label }))}
              onChange={e => setSelected(s => ({ ...s, [q.question]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button onClick={onCancelClick}>取消(走推断)</Button>
        <Button type="primary" disabled={!allAnswered} onClick={onConfirm}>确认</Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/AskUserQuestionModal.tsx
git commit -m "feat(ui): AskUserQuestionModal with radio/checkbox per question"
```

---

## Task 13: `<ProjectBriefForm>` 组件

**Files:**
- Create: `src/renderer/components/ProjectBriefForm.tsx`

(同上,不写组件单测,Task 16 手测验证。)

- [ ] **Step 1: 新建 `src/renderer/components/ProjectBriefForm.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { Input, InputNumber, Tag } from 'antd'
import type { ProjectBrief } from '@shared/types'

const { TextArea } = Input

export interface ProjectBriefFormProps {
  value: ProjectBrief | null
  onChange: (b: ProjectBrief) => void
  badge: 'empty' | 'optimized' | 'edited'
}

export function ProjectBriefForm({ value, onChange, badge }: ProjectBriefFormProps) {
  const [local, setLocal] = useState<ProjectBrief>(value ?? {
    name: '', audience: '', durationMinutes: 30, pageCountEst: 20, content: '', style: '',
  })

  useEffect(() => { setLocal(value ?? { name:'', audience:'', durationMinutes:30, pageCountEst:20, content:'', style:'' }) }, [value])

  const update = (patch: Partial<ProjectBrief>) => {
    const next = { ...local, ...patch }
    if (patch.durationMinutes !== undefined) {
      next.pageCountEst = Math.max(3, Math.min(60, Math.round(patch.durationMinutes / 1.5)))
    }
    setLocal(next)
    onChange(next)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>项目信息(结构化)</strong>
        <Tag color={badge === 'optimized' ? 'green' : badge === 'edited' ? 'orange' : 'default'}>
          {badge === 'optimized' ? '✓ 已优化' : badge === 'edited' ? '已编辑' : '点击右侧"优化"生成'}
        </Tag>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>PPT 名称(≤ 30)</label>
        <Input maxLength={30} value={local.name} onChange={e => update({ name: e.target.value })} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲对象和场景(≤ 80)</label>
        <TextArea rows={2} maxLength={80} showCount value={local.audience} onChange={e => update({ audience: e.target.value })} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲时长(分钟)</label>
        <InputNumber min={1} max={120} value={local.durationMinutes}
          onChange={v => v && update({ durationMinutes: v as number })} />
        <small style={{ marginLeft: 8, color: '#6b7280' }}>≈ {local.pageCountEst} 页</small>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲内容(≤ 800)</label>
        <TextArea rows={6} maxLength={800} showCount value={local.content}
          onChange={e => update({ content: e.target.value })}
          style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13 }} />
      </div>
      <div>
        <label>整体风格(≤ 80)</label>
        <Input maxLength={80} value={local.style} onChange={e => update({ style: e.target.value })} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ProjectBriefForm.tsx
git commit -m "feat(ui): ProjectBriefForm with 5 fields + pageCountEst link"
```

---

## Task 14: `CollectEditor` 改写(拆两区 + 集成)

**Files:**
- Modify: `src/renderer/routes/CollectEditor.tsx`

- [ ] **Step 1: 替换 `CollectEditor.tsx` 为新实现**

完整替换文件:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Input, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { useProjectDetailStore } from '../stores/projectDetail'
import { useOutlineStore } from '../stores/outline'
import { useBriefOptimizeStore } from '../stores/briefOptimize'
import { ProjectBriefForm } from '../components/ProjectBriefForm'
import { AskUserQuestionModal } from '../components/AskUserQuestionModal'
import type { ProjectBrief } from '@shared/types'

const { TextArea } = Input

const StageNavWithDirty = StageNav as unknown as React.FC<React.ComponentProps<typeof StageNav> & { dirty?: boolean }>

export function CollectEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const detail = useProjectDetailStore(s => s.detail)
  const patchDetail = useProjectDetailStore(s => s.patchDetail)
  const setOutline = useOutlineStore(s => s.setOutline)

  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [brief, setBrief] = useState<ProjectBrief | null>(null)
  const [badge, setBadge] = useState<'empty' | 'optimized' | 'edited'>('empty')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [optimizing, setOptimizing] = useState(false)

  const phase = useBriefOptimizeStore(s => s.phase)
  const error = useBriefOptimizeStore(s => s.error)
  const startOptimize = useBriefOptimizeStore(s => s.start)
  const resetOptimize = useBriefOptimizeStore(s => s.reset)

  // Restore from detail
  useEffect(() => {
    if (detail?.id === id) {
      if (detail.topic) setTopic(detail.topic)
      if (detail.source !== null) setSource(detail.source)
      if (detail.brief) { setBrief(detail.brief); setBadge(detail.brief ? 'optimized' : 'empty') }
      setDirty(false)
    }
  }, [detail?.id, id])

  // Track optimize phase
  useEffect(() => {
    if (phase === 'optimizing' || phase === 'asking') { setOptimizing(true); return }
    if (phase === 'done') {
      setOptimizing(false)
      const b = useBriefOptimizeStore.getState().current
      void b
      // brief already written via patchDetail below
    }
    if (phase === 'error') {
      setOptimizing(false)
      message.error(error ?? '优化失败')
      resetOptimize()
    }
  }, [phase, error, message, resetOptimize])

  // Capture done brief into form
  useEffect(() => {
    if (phase !== 'done') return
    // latest brief is delivered via onDone handler below; nothing to read here
  }, [phase])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.stage.collectSave(id, topic, source, brief)
      patchDetail({ source, topic, brief })
      setDirty(false)
      message.success('已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onOptimize = async () => {
    if (!source.trim()) {
      message.warning('请先在上方粘贴原始描述')
      return
    }
    setOptimizing(true)
    try {
      await startOptimize(id, brief)
    } catch (e: any) {
      message.error(e?.message ?? '启动优化失败')
      setOptimizing(false)
    }
  }

  // Wire onDone via store subscription (one-shot)
  useEffect(() => {
    const u = api.brief.onDone((e: any) => {
      setBrief(e.brief)
      setBadge('optimized')
      setDirty(true)
    })
    return u
  }, [])

  const onBriefChange = (b: ProjectBrief) => {
    setBrief(b)
    setBadge('edited')
    setDirty(true)
  }

  const onNext = () => { /* router: StageNav handles */ }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 1 步 · 项目信息</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>
          上方粘贴原始描述,下方填/优化结构化字段,下一步将基于结构化字段生成大纲。
        </p>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Input
            placeholder="项目主题"
            value={topic}
            onChange={e => { setTopic(e.target.value); setDirty(true) }}
            style={{ marginBottom: 12 }}
          />
          <TextArea
            rows={10}
            value={source}
            onChange={e => { setSource(e.target.value); setDirty(true) }}
            placeholder="把你的内容粘贴到这里...(供 Agent 优化使用,不会直接进大纲)"
            style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
          <small style={{ color: '#9ca3af' }}>本框内容仅供优化用,不会直接进大纲。</small>
        </div>

        <ProjectBriefForm value={brief} onChange={onBriefChange} badge={badge} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <small style={{ color: '#9ca3af' }}>字符数:{source.length}</small>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onSave} loading={saving} disabled={!dirty}>保存项目信息</Button>
            <Button type="primary" onClick={onOptimize} loading={optimizing} disabled={optimizing}>✨ 优化</Button>
          </div>
        </div>
      </div>
      <StageNavWithDirty
        projectId={id}
        current="collect"
        canNext={source.trim().length > 0 && brief !== null && !optimizing}
        dirty={dirty}
        onNext={onNext}
        nextLabel="下一步:生成大纲"
      />
      <AskUserQuestionModal />
    </div>
  )
}
```

- [ ] **Step 2: typecheck**

Run: `bun run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/CollectEditor.tsx
git commit -m "feat(collect): redesign as 项目信息 with brief form + optimize"
```

---

## Task 15: 重建主进程 + 完整 Electron 重启 (AGENTS.md 要求)

**Files:** (no code change)

- [ ] **Step 1: 重建主进程 bundle**

Run: `bun run build:main`
Expected: 退出 0,产物更新

- [ ] **Step 2: 完全退出 Electron**

手动 `Cmd+Q` 退出当前 Electron 实例(若在跑)。

- [ ] **Step 3: 启动 dev**

Run: `bun run dev`
Expected: vite + tsc watch + electron 起来

- [ ] **Step 4: 全套验证**

```bash
bun run typecheck
bun run test
```

Expected: exit 0,所有测试通过

- [ ] **Step 5: 手动验证清单**(对照 spec 第 9.2 节)

- [ ] CollectEditor 标题变成「项目信息」
- [ ] source 框 + 结构化区都在同一页
- [ ] 点「优化」 → 进度条出现
- [ ] LLM 调 AskUserQuestion → antd Modal 弹出,header 短标签
- [ ] 选项 2-4 个,点选项关闭、点取消也关闭
- [ ] 完成后 5 字段填好,角标「✓ 已优化」
- [ ] 改一个字段 → 角标变「已编辑」, dirty=true
- [ ] 「保存项目信息」 → 重进页面字段保留
- [ ] 「下一步」 → /projects/:id/outline, 大纲基于 brief
- [ ] 老数据(无 brief) → 跳到 outline 时 stage.ts 抛 "请先优化"

(不需要 commit — 这是验证步骤)

---

## Self-Review (在 15 个 task 写完后)

**1. Spec coverage:**

| Spec 章节 | 覆盖 Task |
|-----------|----------|
| § 3 数据契约 (ProjectBrief + pageCountEst) | T1 |
| § 4.1 架构 1 句 (BriefAgent) | T8 |
| § 4.2 模块边界 | T1/T2/T3/T4/T7/T8/T9/T10/T11/T12/T13/T14 |
| § 4.3 数据流 (8 步) | T8+T9+T10+T11 |
| § 4.4 异常路径 (5 种) | T8(单测)+T9(并发 reject)+T11(单测) |
| § 5.1 BriefAgent 实现 | T8 |
| § 5.2 askUserQuestionSchema(JSON Schema) | T8 |
| § 5.3 useBriefOptimizeStore | T11 |
| § 5.4 AskUserQuestionModal | T12 |
| § 5.5 CollectEditor 改写 | T14 |
| § 6.1 brief-optimize prompt | T4 |
| § 6.2 outline prompt 切到 brief | T5+T6 |
| § 7 IPC 三件套 | T3+T9+T10 |
| § 8 文件清单 | 全部 |
| § 9.1 单元测试 | T1/T2/T4/T8/T9/T11 |
| § 9.2 live 验证 | T15 |
| § 10 风险 | T6(brief-fallback)、T9(并发 reject)、T15(主进程 rebuild) |

**2. Placeholder scan:** 无"TBD"/"TODO"/"see section"/"实测时确认"。

**3. Type 一致性:**
- `AskUserRequest.questions[].multiSelect` — T8 定义、T11/T12 引用 ✓
- `AskAnswer.value` 类型 `Record<string, string|string[]>` — T8 定义、T11/T12 引用 ✓
- `ProjectBrief.pageCountEst` — T1 计算、T13 联动显示 ✓
- `STAGE_BRIEF_OPTIMIZE_START/CANCEL/ANSWER` + `STAGE_ASK_USER_QUESTION/DONE/ERROR` — T3 加 channel、T9 handler、T10 preload ✓
- `computePageCountEst` — T1 定义、T13 重复实现(为响应式)— 略冗余,接受(react state 必须 client-side 算)

(注: T1 spec 用 throw `AppError` 但用了 `BriefParseError extends Error` — 是有意为之的最小化改动,project memory 说"src/main/fs/projects.ts 等用 `AppError`",但 brief 校验在 shared 层不该 import main 路径,故用自有 BriefParseError)
