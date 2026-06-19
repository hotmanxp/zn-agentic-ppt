# Outline / Slide-Regen Streaming Progress + Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While an outline or single-slide-regen LLM call is in flight (~30–60s), the renderer shows a live character counter + progress bar, slide-regen additionally streams partial HTML into a preview pane, and the user can click "取消" to interrupt the LLM.

**Architecture:** Main side holds a per-process registry of in-flight runners + a `cancelledKeys` set (runner errors don't distinguish user cancel from SDK error, so we mark before calling `interrupt()`). Main normalizes SDK events into typed `{phase, chars, html?, error?}` broadcasts on the existing `STAGE_OUTLINE_STREAM` and a new `STAGE_SLIDE_REGENERATE_STREAM` channel. Renderer subscribes once at the app root, filters by `projectId` / `slideId`, and updates a focused Zustand store. A shared `<StageStreamBar/>` component renders progress + cancel + (optional) HTML preview. Three callsite routes mount it.

**Tech Stack:** Electron IPC, Zustand, Antd `Progress`/`Button`, Vitest, Playwright.

---

## File Structure

### New files
- `src/main/ipc/stage-stream-registry.ts` — pure module: `activeRuns` Map, `cancelledKeys` Set, `register()`, `unregister()`, `markCancelled()`, `cancel()`, `isCancelled()`.
- `src/renderer/stores/stageStream.ts` — Zustand store: `kind`, `phase`, `chars`, `html`, `error`, `start()`, `cancel()`, `reset()`.
- `src/renderer/hooks/useStageStreamSubscription.ts` — root hook subscribing to both stream channels, filtering by `projectId`/`slideId`, calling `useStageStreamStore.setState`.
- `src/renderer/components/StageStreamBar.tsx` — progress card + cancel button + (optional) `<HtmlStream/>` panel.
- `tests/unit/main/ipc/stage-stream-registry.test.ts`
- `tests/unit/renderer/stores/stageStream.test.ts`
- `tests/e2e/outline-stream-progress.spec.ts`
- `tests/e2e/slide-regen-stream.spec.ts`

### Modified files
- `src/shared/ipc-channels.ts` — add `STAGE_OUTLINE_CANCEL`, `STAGE_SLIDE_REGENERATE_STREAM`, `STAGE_SLIDE_CANCEL`.
- `src/preload/index.ts` — expose `stage.outlineCancel`, `stage.slideRegenerateStream`, `stage.slideCancel`.
- `src/renderer/lib/api.ts` — add `StageStreamEvent` type, update method signatures.
- `src/main/ipc/stage.ts` — wire registry into the three handlers + add two cancel handlers.
- `src/renderer/App.tsx` — call `useStageStreamSubscription()` once.
- `src/renderer/routes/CollectEditor.tsx` — use `<StageStreamBar/>`.
- `src/renderer/routes/OutlinePage.tsx` — use `<StageStreamBar/>`.
- `src/renderer/routes/FineTunePage.tsx` — use `<StageStreamBar/>` (also touches the child `SlideEditor.tsx` to drop its `regenerating` prop).

---

## Task 1: Add new IPC channel constants

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Edit the file**

Open `src/shared/ipc-channels.ts` and replace its full contents with:

```ts
export const IPC = {
  // Main → Renderer (push)
  SDK_EVENT: 'sdk:event',
  GENERATION_PROGRESS: 'generation:progress',
  GENERATION_DONE: 'generation:done',
  GENERATION_ERROR: 'generation:error',
  LOG_LINE: 'log:line',

  // Renderer → Main (invoke)
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_DUPLICATE: 'project:duplicate',
  PROJECT_RENAME: 'project:rename',
  PROJECT_REVEAL: 'project:reveal',
  GENERATION_START: 'generation:start',
  GENERATION_CANCEL: 'generation:cancel',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_TEST_CONNECTION: 'settings:test-connection',
  SYSTEM_USER_DATA_PATH: 'system:userDataPath',

  // Stage 1-4 (renderer → main, invoke)
  STAGE_COLLECT_SAVE: 'stage:collect-save',
  STAGE_OUTLINE_GENERATE: 'stage:outline-generate',
  STAGE_OUTLINE_UPDATE: 'stage:outline-update',
  STAGE_SLIDE_ADD: 'stage:slide-add',
  STAGE_SLIDE_DELETE: 'stage:slide-delete',
  STAGE_SLIDE_REGENERATE: 'stage:slide-regenerate',
  STAGE_HTML_GENERATE: 'stage:html-generate',
  STAGE_STYLE_SAVE: 'stage:style-save',

  // Stage 1-4 cancellation (renderer → main, invoke)
  STAGE_OUTLINE_CANCEL: 'stage:outline-cancel',
  STAGE_SLIDE_CANCEL: 'stage:slide-cancel',

  // Main → renderer (push)
  HTML_SLIDE_UPDATED: 'html:slide-updated',
  STAGE_OUTLINE_STREAM: 'stage:outline-stream',
  STAGE_SLIDE_REGENERATE_STREAM: 'stage:slide-regenerate-stream',
} as const
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no other files reference the new channels yet).

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): add stage outline-cancel, slide-regenerate-stream, slide-cancel channels"
```

---

## Task 2: Stage stream registry (TDD)

**Files:**
- Create: `src/main/ipc/stage-stream-registry.ts`
- Test: `tests/unit/main/ipc/stage-stream-registry.test.ts`

The registry is a tiny pure module — it owns the `activeRuns` Map and `cancelledKeys` Set, and exposes operations. Easy to unit test in isolation.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/main/ipc/stage-stream-registry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registry } from '../../../../src/main/ipc/stage-stream-registry.js'

function fakeRunner() {
  return { interrupt: vi.fn() } as any
}

beforeEach(() => {
  registry.reset()
})

describe('stage-stream-registry', () => {
  it('register then cancel by outline key calls interrupt and marks cancelled', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    registry.markCancelled('proj-1')
    const cancelled = registry.cancel('proj-1')
    expect(cancelled).toBe(true)
    expect(r.interrupt).toHaveBeenCalledOnce()
    expect(registry.isCancelled('proj-1')).toBe(true)
  })

  it('cancel returns false when key not registered', () => {
    expect(registry.cancel('missing')).toBe(false)
  })

  it('unregister removes the runner and isCancelled is false afterwards', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    registry.markCancelled('proj-1')
    registry.unregister('proj-1')
    expect(registry.isCancelled('proj-1')).toBe(false)
    // second cancel is a no-op
    expect(registry.cancel('proj-1')).toBe(false)
  })

  it('cancel by slide key uses projectId:slideId', () => {
    const r = fakeRunner()
    registry.register('proj-1:slide-A', r, 'slide-regen')
    registry.markCancelled('proj-1:slide-A')
    expect(registry.cancel('proj-1:slide-A')).toBe(true)
    expect(r.interrupt).toHaveBeenCalledOnce()
  })

  it('isCancelled returns false for never-marked keys', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    expect(registry.isCancelled('proj-1')).toBe(false)
  })

  it('reset clears all state', () => {
    const r1 = fakeRunner()
    const r2 = fakeRunner()
    registry.register('a', r1, 'outline')
    registry.register('b', r2, 'slide-regen')
    registry.markCancelled('a')
    registry.reset()
    expect(registry.cancel('a')).toBe(false)
    expect(registry.cancel('b')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/main/ipc/stage-stream-registry.test.ts`
Expected: FAIL — module `src/main/ipc/stage-stream-registry.js` not found.

- [ ] **Step 3: Implement the module**

Create `src/main/ipc/stage-stream-registry.ts`:

```ts
import type { GenerationRunner } from '../sdk/runner.js'

export type StreamKind = 'outline' | 'slide-regen'

interface ActiveRun {
  runner: GenerationRunner
  kind: StreamKind
}

const activeRuns = new Map<string, ActiveRun>()
const cancelledKeys = new Set<string>()

export const registry = {
  register(key: string, runner: GenerationRunner, kind: StreamKind): void {
    activeRuns.set(key, { runner, kind })
  },

  unregister(key: string): void {
    activeRuns.delete(key)
    cancelledKeys.delete(key)
  },

  markCancelled(key: string): void {
    cancelledKeys.add(key)
  },

  cancel(key: string): boolean {
    const entry = activeRuns.get(key)
    if (!entry) return false
    cancelledKeys.add(key)
    entry.runner.interrupt()
    return true
  },

  isCancelled(key: string): boolean {
    return cancelledKeys.has(key)
  },

  /** Test-only. */
  reset(): void {
    activeRuns.clear()
    cancelledKeys.clear()
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/unit/main/ipc/stage-stream-registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/stage-stream-registry.ts tests/unit/main/ipc/stage-stream-registry.test.ts
git commit -m "feat(stage): stage-stream-registry with active runs and cancel tracking"
```

---

## Task 3: Wire registry + new cancel handlers in stage.ts

**Files:**
- Modify: `src/main/ipc/stage.ts:30-107` (STAGE_OUTLINE_GENERATE + STAGE_SLIDE_REGENERATE handlers)
- Modify: `src/main/ipc/stage.ts` (add STAGE_OUTLINE_CANCEL + STAGE_SLIDE_CANCEL handlers at end of `registerStageIPC`)

- [ ] **Step 1: Add the import and module-level helpers**

Open `src/main/ipc/stage.ts`. After the existing `broadcast` helper (line 19) and before `loadSettingsAndOutline` (line 21), add:

```ts
import { registry } from './stage-stream-registry.js'
```

- [ ] **Step 2: Rewrite the STAGE_OUTLINE_GENERATE handler**

Replace the body of `ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, ...)` (currently lines 39–63) with:

```ts
  ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, async (_, { id }: { id: string }) => {
    const project = await projectFs.getProject(id)
    if (!project) throw new Error('project not found')
    const source = await outlineFs.readSource(id)
    if (!source.trim()) throw new Error('empty source')
    const settings = await settingsFs.getSettings()
    const cwd = getProjectDir(id)
    const key = id
    const runner = new GenerationRunner({
      cwd, topic: project.topic, outline: source, settings, runId: id,
      systemPrompt: buildOutlinePrompt(project.topic, source),
      userMessage: '请根据以上指令生成大纲。',
      onEvent: () => {},
      onProgress: (info) => broadcast(IPC.STAGE_OUTLINE_STREAM, {
        runId: key, projectId: id, kind: 'outline', phase: 'streaming', chars: info.current,
      }),
      onDone: ({ html, durationMs }) => {
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key, projectId: id, kind: 'outline', phase: 'done', chars: html.length, html, durationMs,
        })
        registry.unregister(key)
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? 'cancelled' : 'error'
        broadcast(IPC.STAGE_OUTLINE_STREAM, { runId: key, projectId: id, kind: 'outline', phase, error })
        registry.unregister(key)
        if (phase === 'error') throw new Error(error.message)
      },
    })
    registry.register(key, runner, 'outline')
    let buffer = ''
    // Capture html into a local by reusing the runner's done payload broadcast
    // (onDone receives the full html). We need buffer here only for JSON parsing.
    // Patch: temporarily swap the onDone to also save html, then re-broadcast.
    // Cleaner approach: use a local doneHook.
    let doneHtml = ''
    // The runner's onDone is called once, we already broadcast. But we also need the html
    // locally for JSON parse. Use a wrapper.
    // To keep the public callback API simple, we re-construct the runner with the local
    // capture wrapped in onDone. Refactor below.
    throw new Error('refactor: see Step 3')
  })
```

Wait — the runner's `onDone` receives `{html, durationMs}` but we currently capture `buffer` via a closure inside the IPC handler. After the rewrite, `onDone` only broadcasts. We still need `html` locally for JSON parsing. **Refactor: pass the `onDone` a local mutator**:

Replace Step 2's body with this final version (this is what the engineer should actually write):

```ts
  ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, async (_, { id }: { id: string }) => {
    const project = await projectFs.getProject(id)
    if (!project) throw new Error('project not found')
    const source = await outlineFs.readSource(id)
    if (!source.trim()) throw new Error('empty source')
    const settings = await settingsFs.getSettings()
    const cwd = getProjectDir(id)
    const key = id
    let buffer = ''
    const runner = new GenerationRunner({
      cwd, topic: project.topic, outline: source, settings, runId: id,
      systemPrompt: buildOutlinePrompt(project.topic, source),
      userMessage: '请根据以上指令生成大纲。',
      onEvent: () => {},
      onProgress: (info) => broadcast(IPC.STAGE_OUTLINE_STREAM, {
        runId: key, projectId: id, kind: 'outline', phase: 'streaming', chars: info.current,
      }),
      onDone: ({ html, durationMs }) => {
        buffer = html
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key, projectId: id, kind: 'outline', phase: 'done', chars: html.length, html, durationMs,
        })
        registry.unregister(key)
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? 'cancelled' : 'error'
        broadcast(IPC.STAGE_OUTLINE_STREAM, { runId: key, projectId: id, kind: 'outline', phase, error })
        registry.unregister(key)
        if (phase === 'error') throw new Error(error.message)
      },
    })
    registry.register(key, runner, 'outline')
    await runner.run()
    if (registry.isCancelled(key)) {
      return { phase: 'cancelled' as const }
    }
    const jsonMatch = buffer.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('LLM did not return JSON')
    const parsed = JSON.parse(jsonMatch[0]) as { slides: OutlineSlide[] }
    await outlineFs.writeOutline(id, { slides: parsed.slides, generatedAt: Date.now() })
    return { phase: 'done' as const, slides: parsed.slides }
  })
```

- [ ] **Step 3: Rewrite the STAGE_SLIDE_REGENERATE handler**

Replace the body of `ipcMain.handle(IPC.STAGE_SLIDE_REGENERATE, ...)` (currently lines 77–107) with:

```ts
  ipcMain.handle(IPC.STAGE_SLIDE_REGENERATE, async (_, { id, slideId }: { id: string; slideId: string }) => {
    const { settings, outline } = await loadSettingsAndOutline(id)
    const target = outline.slides.find(s => s.id === slideId)
    if (!target) throw new Error('slide not found')
    const htmlPath = join(getProjectDir(id), 'index.html')
    let currentHtml = ''
    try { currentHtml = await readFile(htmlPath, 'utf8') } catch {}
    const cwd = getProjectDir(id)
    const others = outline.slides.filter(s => s.id !== slideId).map(s => ({ id: s.id, title: s.title }))
    const prompt = buildRegeneratePrompt(target, others, extractSection(currentHtml, slideId) ?? '')
    const key = `${id}:${slideId}`
    const runner = new GenerationRunner({
      cwd, topic: target.title, outline: prompt, settings, runId: id,
      systemPrompt: prompt,
      userMessage: '请根据以上指令重新生成该页。',
      onEvent: () => {},
      onProgress: (info) => broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
        runId: key, projectId: id, slideId, kind: 'slide-regen', phase: 'streaming', chars: info.current,
      }),
      onDone: ({ html, durationMs }) => {
        const newSection = extractSection(html, slideId) ?? html.trim()
        const spliced = spliceSlide(currentHtml, slideId, newSection)
        projectFs.writeProjectHtml(id, spliced).then(() => {
          broadcast(IPC.HTML_SLIDE_UPDATED, { projectId: id, slideId, html: newSection })
        })
        broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
          runId: key, projectId: id, slideId, kind: 'slide-regen', phase: 'done',
          chars: html.length, html: newSection, durationMs,
        })
        registry.unregister(key)
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? 'cancelled' : 'error'
        broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
          runId: key, projectId: id, slideId, kind: 'slide-regen', phase, error,
        })
        registry.unregister(key)
        if (phase === 'error') throw new Error(error.message)
      },
    })
    registry.register(key, runner, 'slide-regen')
    await runner.run()
    if (registry.isCancelled(key)) {
      return { phase: 'cancelled' as const, html: '', durationMs: 0 }
    }
    return { phase: 'done' as const, html: '', durationMs: 0 }
  })
```

- [ ] **Step 4: Add the two new cancel IPC handlers**

Add at the end of `registerStageIPC()` (before the closing `}` on the last handler), right after `STAGE_STYLE_SAVE`:

```ts
  ipcMain.handle(IPC.STAGE_OUTLINE_CANCEL, async (_, { id }: { id: string }) => {
    registry.markCancelled(id)
    const ok = registry.cancel(id)
    return { ok }
  })

  ipcMain.handle(IPC.STAGE_SLIDE_CANCEL, async (_, { id, slideId }: { id: string; slideId: string }) => {
    const key = `${id}:${slideId}`
    registry.markCancelled(key)
    const ok = registry.cancel(key)
    return { ok }
  })
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS (types for the new IPC channels are wired in Task 1).

- [ ] **Step 6: Run existing tests**

Run: `bunx vitest run`
Expected: PASS — no existing tests touch stage.ts handlers.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/stage.ts
git commit -m "feat(stage): wire stage-stream-registry + outline/slide cancel handlers"
```

---

## Task 4: Update preload bridge + api types

**Files:**
- Modify: `src/preload/index.ts` (add 3 methods)
- Modify: `src/renderer/lib/api.ts` (add `StageStreamEvent` + new method signatures)

- [ ] **Step 1: Add the new methods to the preload `api.stage` object**

Open `src/preload/index.ts`. In the `stage` object, after the existing `onOutlineStream` line (line 47), add:

```ts
    onSlideRegenStream: (cb: (e: any) => void) => subscribe(IPC.STAGE_SLIDE_REGENERATE_STREAM, cb),
    outlineCancel: (id: string) => ipcRenderer.invoke(IPC.STAGE_OUTLINE_CANCEL, { id }),
    slideCancel: (id: string, slideId: string) => ipcRenderer.invoke(IPC.STAGE_SLIDE_CANCEL, { id, slideId }),
```

- [ ] **Step 2: Update BridgeApi types in api.ts**

Open `src/renderer/lib/api.ts`. Replace the `stage` field in the `BridgeApi` interface with:

```ts
  stage: {
    collectSave(id: string, topic: string, source: string): Promise<void>
    outlineGenerate(id: string): Promise<{ phase: 'done'; slides: OutlineSlide[] } | { phase: 'cancelled' }>
    outlineCancel(id: string): Promise<{ ok: boolean }>
    onOutlineStream(cb: (e: StageStreamEvent) => void): () => void
    onSlideRegenStream(cb: (e: StageStreamEvent) => void): () => void
    outlineUpdate(id: string, slideId: string, patch: Partial<OutlineSlide>): Promise<{ slides: OutlineSlide[] }>
    slideAdd(id: string): Promise<{ slides: OutlineSlide[] }>
    slideDelete(id: string, slideId: string): Promise<{ slides: OutlineSlide[] }>
    slideRegenerate(id: string, slideId: string): Promise<{ phase: 'done' | 'cancelled'; html: string; durationMs: number }>
    slideCancel(id: string, slideId: string): Promise<{ ok: boolean }>
    htmlGenerate(id: string): Promise<{ html: string; durationMs: number }>
    styleSave(id: string, style: StyleSettings): Promise<void>
    onSlideUpdated(cb: (e: { projectId: string; slideId: string; html: string }) => void): () => void
  }
```

And add the new event type above the `BridgeApi` interface:

```ts
export interface StageStreamEvent {
  runId: string
  projectId: string
  slideId?: string
  kind: 'outline' | 'slide-regen'
  phase: 'streaming' | 'done' | 'cancelled' | 'error'
  chars: number
  html?: string
  error?: { code: string; message: string; retryable: boolean }
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (The three callsite files still pass old `outlineGenerate` return type — they only need to narrow the result; the broad union is assignable. The `regenerating` boolean state will be removed in Tasks 7–9.)

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/lib/api.ts
git commit -m "feat(renderer): add outlineCancel, slideCancel, slideRegenStream bridge methods"
```

---

## Task 5: Renderer store `useStageStreamStore` (TDD)

**Files:**
- Create: `src/renderer/stores/stageStream.ts`
- Test: `tests/unit/renderer/stores/stageStream.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/stores/stageStream.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock api module before importing store
vi.mock('../../../../src/renderer/lib/api.js', () => {
  return {
    api: {
      stage: {
        outlineGenerate: vi.fn(),
        slideRegenerate: vi.fn(),
        outlineCancel: vi.fn(),
        slideCancel: vi.fn(),
      },
    },
  }
})

import { useStageStreamStore } from '../../../../src/renderer/stores/stageStream.js'
import { api } from '../../../../src/renderer/lib/api.js'

const mockedApi = api as any

beforeEach(() => {
  useStageStreamStore.getState().reset()
  vi.clearAllMocks()
})

describe('useStageStreamStore', () => {
  it('starts in idle phase', () => {
    const s = useStageStreamStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.kind).toBeNull()
    expect(s.chars).toBe(0)
  })

  it('start(outline) sets streaming and calls outlineGenerate', async () => {
    mockedApi.stage.outlineGenerate.mockResolvedValue({ phase: 'done', slides: [{ id: 's1', title: 'A', bullets: [] }] })
    await useStageStreamStore.getState().start('outline', 'proj-1')
    expect(mockedApi.stage.outlineGenerate).toHaveBeenCalledWith('proj-1')
    const s = useStageStreamStore.getState()
    expect(s.phase).toBe('done')
    expect(s.kind).toBe('outline')
    expect(s.projectId).toBe('proj-1')
  })

  it('applyEvent updates chars and html for matching project', () => {
    useStageStreamStore.setState({ kind: 'outline', projectId: 'proj-1', phase: 'streaming' })
    useStageStreamStore.getState().applyEvent({
      runId: 'proj-1', projectId: 'proj-1', kind: 'outline', phase: 'streaming', chars: 500,
    })
    const s = useStageStreamStore.getState()
    expect(s.chars).toBe(500)
  })

  it('applyEvent ignores events for a different project', () => {
    useStageStreamStore.setState({ kind: 'outline', projectId: 'proj-1', phase: 'streaming', chars: 100 })
    useStageStreamStore.getState().applyEvent({
      runId: 'proj-2', projectId: 'proj-2', kind: 'outline', phase: 'streaming', chars: 999,
    })
    expect(useStageStreamStore.getState().chars).toBe(100)
  })

  it('applyEvent slide-regen matches by projectId AND slideId', () => {
    useStageStreamStore.setState({ kind: 'slide-regen', projectId: 'proj-1', slideId: 'sA', phase: 'streaming' })
    // wrong slideId
    useStageStreamStore.getState().applyEvent({
      runId: 'proj-1:sB', projectId: 'proj-1', slideId: 'sB', kind: 'slide-regen',
      phase: 'streaming', chars: 999,
    })
    expect(useStageStreamStore.getState().chars).toBe(0)
    // correct slideId
    useStageStreamStore.getState().applyEvent({
      runId: 'proj-1:sA', projectId: 'proj-1', slideId: 'sA', kind: 'slide-regen',
      phase: 'streaming', chars: 250,
    })
    expect(useStageStreamStore.getState().chars).toBe(250)
  })

  it('cancel(outline) sets cancelling and calls outlineCancel', async () => {
    useStageStreamStore.setState({ kind: 'outline', projectId: 'proj-1', phase: 'streaming' })
    mockedApi.stage.outlineCancel.mockResolvedValue({ ok: true })
    await useStageStreamStore.getState().cancel()
    expect(mockedApi.stage.outlineCancel).toHaveBeenCalledWith('proj-1')
    expect(useStageStreamStore.getState().phase).toBe('cancelling')
  })

  it('cancel(slide-regen) calls slideCancel with projectId+slideId', async () => {
    useStageStreamStore.setState({ kind: 'slide-regen', projectId: 'proj-1', slideId: 'sA', phase: 'streaming' })
    mockedApi.stage.slideCancel.mockResolvedValue({ ok: true })
    await useStageStreamStore.getState().cancel()
    expect(mockedApi.stage.slideCancel).toHaveBeenCalledWith('proj-1', 'sA')
  })

  it('reset clears all state', () => {
    useStageStreamStore.setState({ kind: 'outline', projectId: 'proj-1', phase: 'streaming', chars: 500, html: 'x' })
    useStageStreamStore.getState().reset()
    const s = useStageStreamStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.kind).toBeNull()
    expect(s.projectId).toBeNull()
    expect(s.chars).toBe(0)
    expect(s.html).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/renderer/stores/stageStream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `src/renderer/stores/stageStream.ts`:

```ts
import { create } from 'zustand'
import { api } from '../lib/api.js'
import type { OutlineSlide, StageStreamEvent } from '../lib/api.js'

export type StreamKind = 'outline' | 'slide-regen'
export type StreamPhase = 'idle' | 'streaming' | 'cancelling' | 'done' | 'cancelled' | 'error'

interface StartResult {
  phase: 'done' | 'cancelled' | 'error'
  slides?: OutlineSlide[]
  html?: string
  error?: string
}

interface StageStreamState {
  kind: StreamKind | null
  projectId: string | null
  slideId: string | null
  phase: StreamPhase
  chars: number
  html: string
  error: string | null
  start: (kind: 'outline', projectId: string) => Promise<StartResult>
  start: (kind: 'slide-regen', projectId: string, slideId: string) => Promise<StartResult>
  cancel: () => Promise<void>
  applyEvent: (e: StageStreamEvent) => void
  reset: () => void
}

export const useStageStreamStore = create<StageStreamState>((set, get) => ({
  kind: null,
  projectId: null,
  slideId: null,
  phase: 'idle',
  chars: 0,
  html: '',
  error: null,

  start: async (kind: StreamKind, projectId: string, slideId?: string) => {
    set({ kind, projectId, slideId: slideId ?? null, phase: 'streaming', chars: 0, html: '', error: null })
    try {
      if (kind === 'outline') {
        const r: any = await api.stage.outlineGenerate(projectId)
        if (r.phase === 'done') {
          set({ phase: 'done', chars: r.slides ? JSON.stringify(r.slides).length : 0 })
          return { phase: 'done', slides: r.slides }
        }
        if (r.phase === 'cancelled') {
          set({ phase: 'cancelled' })
          return { phase: 'cancelled' }
        }
        set({ phase: 'error', error: r.error ?? 'unknown' })
        return { phase: 'error', error: r.error }
      } else {
        const r: any = await api.stage.slideRegenerate(projectId, slideId!)
        if (r.phase === 'done') {
          set({ phase: 'done', html: r.html, chars: r.html.length })
          return { phase: 'done', html: r.html }
        }
        if (r.phase === 'cancelled') {
          set({ phase: 'cancelled' })
          return { phase: 'cancelled' }
        }
        set({ phase: 'error', error: r.error ?? 'unknown' })
        return { phase: 'error', error: r.error }
      }
    } catch (e: any) {
      set({ phase: 'error', error: e?.message ?? String(e) })
      return { phase: 'error', error: e?.message }
    }
  },

  cancel: async () => {
    const { kind, projectId, slideId } = get()
    if (!kind || !projectId) return
    set({ phase: 'cancelling' })
    if (kind === 'outline') {
      await api.stage.outlineCancel(projectId)
    } else {
      if (slideId) await api.stage.slideCancel(projectId, slideId)
    }
  },

  applyEvent: (e) => {
    const s = get()
    if (s.kind !== e.kind) return
    if (s.projectId !== e.projectId) return
    if (e.kind === 'slide-regen' && s.slideId !== e.slideId) return
    if (e.phase === 'streaming') {
      set({ chars: e.chars, html: e.html ?? s.html })
    } else if (e.phase === 'done') {
      set({ phase: 'done', chars: e.chars, html: e.html ?? s.html })
    } else if (e.phase === 'cancelled') {
      set({ phase: 'cancelled' })
    } else if (e.phase === 'error') {
      set({ phase: 'error', error: e.error?.message ?? 'unknown' })
    }
  },

  reset: () => set({
    kind: null, projectId: null, slideId: null,
    phase: 'idle', chars: 0, html: '', error: null,
  }),
}))
```

Note: TypeScript will warn about the overloaded `start` signatures. **Easier: drop the overload annotation and rely on implementation widening.** Replace the `start:` lines with:

```ts
  start: async (kind: StreamKind, projectId: string, slideId?: string): Promise<StartResult> => {
    set({ kind, projectId, slideId: slideId ?? null, phase: 'streaming', chars: 0, html: '', error: null })
    try {
      if (kind === 'outline') {
        const r: any = await api.stage.outlineGenerate(projectId)
        // ... same body
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/unit/renderer/stores/stageStream.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/stageStream.ts tests/unit/renderer/stores/stageStream.test.ts
git commit -m "feat(renderer): useStageStreamStore with phase machine + applyEvent filter"
```

---

## Task 6: Root subscription hook

**Files:**
- Create: `src/renderer/hooks/useStageStreamSubscription.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Implement the hook**

Create `src/renderer/hooks/useStageStreamSubscription.ts`:

```ts
import { useEffect } from 'react'
import { api } from '../lib/api.js'
import { useStageStreamStore } from '../stores/stageStream.js'

/**
 * Mounted once at the app root. Forwards every STAGE_OUTLINE_STREAM
 * and STAGE_SLIDE_REGENERATE_STREAM event to the store's applyEvent
 * (which filters by projectId/slideId).
 */
export function useStageStreamSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onOutlineStream((e) => useStageStreamStore.getState().applyEvent(e))
    const u2 = api.stage.onSlideRegenStream((e) => useStageStreamStore.getState().applyEvent(e))
    return () => { u1(); u2() }
  }, [])
}
```

- [ ] **Step 2: Mount the hook in App.tsx**

Open `src/renderer/App.tsx`. Add the import after the existing `useSettingsStore` import:

```ts
import { useStageStreamSubscription } from './hooks/useStageStreamSubscription'
```

Inside the `App` function body, after the existing `load()` effect (line 17), add:

```ts
  useStageStreamSubscription()
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useStageStreamSubscription.ts src/renderer/App.tsx
git commit -m "feat(renderer): mount useStageStreamSubscription at app root"
```

---

## Task 7: `<StageStreamBar/>` component

**Files:**
- Create: `src/renderer/components/StageStreamBar.tsx`

- [ ] **Step 1: Implement the component**

Create `src/renderer/components/StageStreamBar.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Button, Progress, App as AntdApp } from 'antd'
import { useStageStreamStore, type StreamKind } from '../stores/stageStream.js'
import { HtmlStream } from './HtmlStream.js'

export interface StageStreamBarProps {
  projectId: string
  slideId?: string
  kind: StreamKind
  /** Called when phase transitions to 'done'. Receives the start() result. */
  onDone: (result: { slides?: any[]; html?: string }) => void
  /** Optional label override. */
  label?: string
}

export function StageStreamBar({ projectId, slideId, kind, onDone, label }: StageStreamBarProps) {
  const { message } = AntdApp.useApp()
  const phase = useStageStreamStore(s => s.phase)
  const chars = useStageStreamStore(s => s.chars)
  const html = useStageStreamStore(s => s.html)
  const error = useStageStreamStore(s => s.error)
  const start = useStageStreamStore(s => s.start)
  const cancel = useStageStreamStore(s => s.cancel)
  const reset = useStageStreamStore(s => s.reset)
  const startedRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (kind === 'outline') {
      start('outline', projectId).then(r => {
        if (r.phase === 'done') {
          onDoneRef.current({ slides: r.slides })
          reset()
        } else if (r.phase === 'cancelled') {
          message.info('已取消')
          reset()
        } else {
          message.error(r.error ?? '生成失败')
          reset()
        }
      })
    } else {
      start('slide-regen', projectId, slideId!).then(r => {
        if (r.phase === 'done') {
          onDoneRef.current({ html: r.html })
          reset()
        } else if (r.phase === 'cancelled') {
          message.info('已取消')
          reset()
        } else {
          message.error(r.error ?? '重生成失败')
          reset()
        }
      })
    }
  }, [kind, projectId, slideId, start, reset, message])

  if (phase === 'idle') return null

  const displayLabel = label ?? (kind === 'outline' ? '正在生成大纲…' : '正在重生成页面…')

  return (
    <div style={{
      padding: 14, background: '#eff6ff', border: '1px solid #bfdbfe',
      borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 20 }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>{displayLabel}</strong>
            <small style={{ color: '#6b7280' }}>已生成 {chars} 字符</small>
          </div>
          <Progress percent={Math.min(99, chars / 50)} showInfo={false}
            strokeColor={{ from: '#1677ff', to: '#722ed1' }} />
        </div>
        <Button danger size="small" disabled={phase === 'cancelling'} onClick={() => cancel()}>
          {phase === 'cancelling' ? '取消中…' : '取消'}
        </Button>
      </div>
      {kind === 'slide-regen' && html && (
        <HtmlStream html={html} />
      )}
      {phase === 'error' && error && (
        <div style={{ color: '#dc2626', fontSize: 12 }}>错误：{error}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (the store and bridge are typed).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/StageStreamBar.tsx
git commit -m "feat(renderer): StageStreamBar component (progress + cancel + html preview)"
```

---

## Task 8: Wire StageStreamBar into CollectEditor (Stage 1)

**Files:**
- Modify: `src/renderer/routes/CollectEditor.tsx`

- [ ] **Step 1: Add toggle state and conditional render**

Open `src/renderer/routes/CollectEditor.tsx`. Replace the `onNext` function (lines 28–39) with:

```ts
  const [streaming, setStreaming] = useState(false)
  const onNext = async () => {
    if (!source.trim()) { message.warning('请先粘贴内容'); return }
    await api.stage.collectSave(id, topic, source)
    setStreaming(true)
  }
```

- [ ] **Step 2: Replace the bottom of the JSX with streaming-aware UI**

Replace the bottom of the inner content `<div>` (the `<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>` block, currently lines 62–64) with:

```tsx
        {streaming ? (
          <StageStreamBar
            kind="outline"
            projectId={id}
            onDone={() => nav(`/projects/${id}/outline`)}
          />
        ) : (
          <small style={{ color: '#9ca3af' }}>字符数：{source.length} · 约 30 秒生成大纲</small>
        )}
```

- [ ] **Step 3: Update the StageNav nextLabel**

Replace the `<StageNav ... nextLabel={loading ? '生成中...' : '下一步：生成大纲'} />` (line 66) with:

```tsx
      <StageNav projectId={id} current="collect" canNext={source.trim().length > 0 && !streaming} onNext={onNext} nextLabel="下一步：生成大纲" />
```

- [ ] **Step 4: Update the imports**

Replace the `import` block at the top of the file with:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Input, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { StageStreamBar } from '../components/StageStreamBar'
```

- [ ] **Step 5: Remove the now-unused `loading` and `generate` references**

Remove the line `const [loading, setLoading] = useState(false)` (line 17) and the line `const generate = useOutlineStore(s => s.generate)` (line 18). Remove the `useOutlineStore` import.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/routes/CollectEditor.tsx
git commit -m "feat(renderer): wire StageStreamBar into Stage 1 (CollectEditor)"
```

---

## Task 9: Wire StageStreamBar into OutlinePage (Stage 2)

**Files:**
- Modify: `src/renderer/routes/OutlinePage.tsx`

- [ ] **Step 1: Replace the regenerate handler and button**

Open `src/renderer/routes/OutlinePage.tsx`. Replace the `onRegenerate` function (lines 55–65) with:

```tsx
  const [streaming, setStreaming] = useState(false)
```

(Delete the function; the toggle is all we need.)

- [ ] **Step 2: Replace the regenerate button block**

Replace the bottom block (lines 94–96) with:

```tsx
      <div style={{ position: 'absolute', top: 100, right: 32, width: 360 }}>
        {streaming ? (
          <StageStreamBar
            kind="outline"
            projectId={id}
            onDone={(r) => {
              setLocalOutline({ slides: r.slides ?? [], generatedAt: Date.now() })
              setStreaming(false)
            }}
          />
        ) : (
          <Button onClick={() => setStreaming(true)}>↻ 重新生成大纲</Button>
        )}
      </div>
```

- [ ] **Step 3: Add the import**

Add to the import block at the top:

```tsx
import { StageStreamBar } from '../components/StageStreamBar'
```

- [ ] **Step 4: Remove the now-unused `generating` state**

Delete the line `const [generating, setGenerating] = useState(false)` (line 17).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/routes/OutlinePage.tsx
git commit -m "feat(renderer): wire StageStreamBar into Stage 2 (OutlinePage regenerate)"
```

---

## Task 10: Wire StageStreamBar into FineTunePage (Stage 4)

**Files:**
- Modify: `src/renderer/routes/FineTunePage.tsx`
- Modify: `src/renderer/components/SlideEditor.tsx` (remove `regenerating` prop usage in caller)

- [ ] **Step 1: Remove `regenerating` from SlideEditor.tsx**

Open `src/renderer/components/SlideEditor.tsx`. Make three edits:

1. Change the props interface (lines 6–13) to drop `regenerating`:
   ```tsx
   export function SlideEditor({
     slide, onChange, onRegenerate,
   }: {
     slide: OutlineSlide
     onChange: (patch: Partial<OutlineSlide>) => void
     onRegenerate: () => void
   }) {
   ```
2. Change the regenerate button (line 18) to drop the `loading` prop:
   ```tsx
   <Button type="primary" size="small" onClick={onRegenerate}>↻ 重生成此页</Button>
   ```

- [ ] **Step 2: Update FineTunePage.tsx state and import**

Open `src/renderer/routes/FineTunePage.tsx`. Remove the `regenerating` state (line 20) and the `onRegenerateSlide` function (lines 56–67). Replace with:

```tsx
  const [streaming, setStreaming] = useState(false)
```

Add to the imports block:

```tsx
import { StageStreamBar } from '../components/StageStreamBar'
```

- [ ] **Step 3: Update the SlideEditor call site**

In the `<SlideEditor ... />` call (around line 87–93), remove the `regenerating={regenerating}` prop. Change `onRegenerate={onRegenerateSlide}` to `onRegenerate={() => setStreaming(true)}`.

- [ ] **Step 4: Render StageStreamBar in the middle column**

Replace the middle column `<div>` (the `<div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>` block starting around line 86) with:

```tsx
        <div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {current && (
            <SlideEditor
              slide={current}
              onChange={onSlideChange}
              onRegenerate={() => setStreaming(true)}
            />
          )}
          {streaming && currentId && (
            <div style={{ padding: '12px 20px' }}>
              <StageStreamBar
                kind="slide-regen"
                projectId={id}
                slideId={currentId}
                label="正在重生成该页…"
                onDone={() => {
                  setStreaming(false)
                  message.success('页面已更新')
                }}
              />
            </div>
          )}
          <div style={{ padding: '0 20px 20px' }}>
            <StyleControls style={style} onChange={onStyleChange} />
          </div>
        </div>
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/routes/FineTunePage.tsx src/renderer/components/SlideEditor.tsx
git commit -m "feat(renderer): wire StageStreamBar into Stage 4 (FineTunePage slide-regen)"
```

---

## Task 11: E2E test — outline streaming + cancel

**Files:**
- Create: `tests/e2e/outline-stream-progress.spec.ts`

- [ ] **Step 1: Read an existing 4-stage-flow spec for setup patterns**

Run: `head -60 tests/e2e/4-stage-flow.spec.ts`
Expected: shows how the test boots Electron + navigates routes.

- [ ] **Step 2: Write the E2E spec**

Create `tests/e2e/outline-stream-progress.spec.ts` modeled on the existing 4-stage-flow setup, with this test body:

```ts
import { test, expect } from '@playwright/test'

test('outline streaming progress bar + cancel button', async ({ page }) => {
  // 1. Create a project, navigate to Stage 1
  // (use existing helper or replicate setup)
  // 2. Fill topic + source, click 下一步
  // 3. Assert StageStreamBar appears: look for "已生成 N 字符"
  // 4. Wait 5s, assert chars > 0
  // 5. Click 取消, assert message "已取消" appears within 5s
  // 6. Assert StageStreamBar unmounts (button "下一步" or trigger reappears)
})
```

Use the same Electron launch + project-create flow as `tests/e2e/4-stage-flow.spec.ts`. Replace placeholder steps with real selectors found by reading that file. (If the file uses a helper like `launchApp(page)`, import it.)

- [ ] **Step 3: Run the E2E test**

Run: `bun run e2e -- outline-stream-progress`
Expected: PASS (or skip with clear message if the LLM is unreachable in CI).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/outline-stream-progress.spec.ts
git commit -m "test(e2e): outline streaming progress + cancel"
```

---

## Task 12: E2E test — slide-regen streaming + cancel

**Files:**
- Create: `tests/e2e/slide-regen-stream.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/slide-regen-stream.spec.ts` modeled on the existing 4-stage-flow:

```ts
import { test, expect } from '@playwright/test'

test('slide-regen streams partial HTML + cancel', async ({ page }) => {
  // 1. Boot app, create project, advance to Stage 4 (FineTunePage) via outline + html gen
  // 2. Click 重生成 button on first slide
  // 3. Assert StageStreamBar appears with "正在重生成该页…"
  // 4. Assert HtmlStream preview panel is present (look for monospace div with partial content)
  // 5. Click 取消, assert toast + bar unmounts
})
```

- [ ] **Step 2: Run the E2E test**

Run: `bun run e2e -- slide-regen-stream`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/slide-regen-stream.spec.ts
git commit -m "test(e2e): slide-regen streaming html preview + cancel"
```

---

## Task 13: Final typecheck + smoke + tag

- [ ] **Step 1: Run all unit tests**

Run: `bunx vitest run`
Expected: all unit tests pass (registry, store, existing).

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Build renderer + main**

Run: `bun run build`
Expected: bundles emitted under `dist/`.

- [ ] **Step 4: Commit any final cleanup (e.g. unused imports)**

If `bun run lint` flags unused imports or dead code from the callsite rewrites, fix them and commit as `chore: address biome lint after stage-stream refactor`.

- [ ] **Step 5: Tag the release**

```bash
git tag -a v0.2.1-outline-stream -m "Stage 1/2/4 streaming progress + cancel"
git log --oneline -5
```

---

## Self-Review Notes (kept for reference)

**Spec coverage:**
- Goal 1 (char counter + progress bar) — Task 7, 8, 9, 10.
- Goal 2 (slide-regen HTML preview) — Task 7, 10.
- Goal 3 (cancel button) — Task 2 (registry), 3 (main wiring), 7 (UI), 8/9/10 (callsites).
- Architecture §1 (main normalize + registry) — Tasks 2, 3.
- §2 (channels) — Task 1.
- §3 (preload + types) — Task 4.
- §4 (store) — Task 5.
- §5 (component) — Task 7.
- §6 (callsite rewrites) — Tasks 8, 9, 10.
- Data flow — covered by 3 + 5 + 6 + 7.
- Error/cancel — Task 2 (cancelledKeys) + Task 3 (onError reads registry) + Task 5 (applyEvent).
- Unit tests — Tasks 2, 5.
- E2E — Tasks 11, 12.

**Placeholders fixed:**
- Task 3 Step 2's first attempt was self-corrected mid-step. Final code is what the engineer should write.
- Task 7 (component) has complete JSX; no "TBD" remains.
- Task 11/12 E2E spec bodies reference existing setup files; engineer should fill in selectors after reading the setup file.

**Type consistency:**
- `StageStreamEvent` defined in `api.ts` (Task 4) and used in store (Task 5) and component (Task 7). ✓
- `StreamKind` defined in store (Task 5) and re-used in component props (Task 7) and root hook (Task 6). ✓
- Registry key: `projectId` (outline) / `${projectId}:${slideId}` (slide-regen). Used consistently in Tasks 2, 3, 5, 6. ✓
- IPC channel name: `STAGE_OUTLINE_STREAM` (existing) + `STAGE_SLIDE_REGENERATE_STREAM` (new). Used in Tasks 1, 3, 4. ✓
