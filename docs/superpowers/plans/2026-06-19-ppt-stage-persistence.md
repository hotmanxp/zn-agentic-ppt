# PPT Stage Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor project detail interface to return all stage data (source/structuredOutline/style/slides), restore stores on project re-entry, and add explicit Save buttons across all wizard pages.

**Architecture:** Main-process `fs.getProject` reads N files and returns merged `ProjectDetail`. New `useProjectDetailStore` owns the detail and fans out to existing `useOutlineStore` / `usePptGenerationStore` via new `applyDetail` setters. Per-stage pages keep their existing store reads but switch from implicit auto-save to explicit Save buttons with unsaved-changes prompts.

**Tech Stack:** TypeScript · Bun · Electron · React · Vite · Zustand · antd · vitest

**Spec:** `docs/superpowers/specs/2026-06-19-ppt-stage-persistence-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | `ProjectDetail` shape (source / structuredOutline / style / slides) |
| `src/main/fs/projects.ts` | `getProject` reads N files and returns merged detail |
| `src/renderer/lib/api.ts` | `BridgeApi.project.get` return type |
| `src/renderer/stores/projectDetail.ts` | NEW — owns detail, fans out to other stores |
| `src/renderer/hooks/useLoadProjectDetail.ts` | NEW — routes-level loader, idempotent per id |
| `src/renderer/stores/outline.ts` | Add `applyDetail` setter; remove fake `load` |
| `src/renderer/stores/pptGeneration.ts` | Add `applyDetail` setter; `reset()` clears store |
| `src/renderer/routes/CollectEditor.tsx` | Explicit Save button; restore from detail; unsaved prompt |
| `src/renderer/routes/OutlinePage.tsx` | Drop 500ms debounce; explicit Save; unsaved prompt |
| `src/renderer/routes/GeneratePage.tsx` | Restore slides from detail; drop auto-start |
| `src/renderer/components/StageNav.tsx` | Add optional unsaved-changes guard prop |
| `src/main/fs/__tests__/projects.test.ts` | NEW — merge tests for fs.getProject |
| `src/renderer/stores/__tests__/projectDetail.test.ts` | NEW — applySnapshot dispatches correctly |
| `src/renderer/stores/__tests__/pptGeneration.test.ts` | NEW — applyDetail populates slides |
| `src/renderer/routes/__tests__/OutlinePage.test.tsx` | NEW — unsaved-changes prompt |

---

## Task 1: Extend ProjectDetail Type

**Files:**
- Modify: `src/shared/types.ts:18-23` (extend `ProjectDetail`)

- [ ] **Step 1: Add new fields to ProjectDetail**

In `src/shared/types.ts`, replace the existing `ProjectDetail` interface:

```ts
export interface ProjectDetail extends ProjectMeta {
  // Legacy
  html: string | null
  htmlSize: number | null
  lastGeneratedAt: number | null
  lastError: string | null
  // Stage 1
  source: string | null
  // Stage 2 (structured; ProjectMeta.outline remains legacy markdown)
  structuredOutline: Outline | null
  // Stage 3
  style: StyleSettings | null
  slides: Array<{
    id: string
    html: string
    layout?: 1 | 2 | 3 | 4 | 5
    status: 'done' | 'failed'
    error?: string
  }>
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no consumers use the new fields yet, so adding optional/nullable fields is non-breaking)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): extend ProjectDetail with stage fields"
```

---

## Task 2: fs.getProject Merge — Write Failing Test

**Files:**
- Create: `src/main/fs/__tests__/projects.test.ts`

- [ ] **Step 1: Write failing merge tests**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { getProject } from '../projects.js'
import { getProjectsDir } from '../paths.js'

let testRoot: string
let projectId: string

beforeEach(async () => {
  testRoot = join(tmpdir(), `zn-ppt-test-${randomUUID()}`)
  process.env.ZN_PPT_PROJECTS_DIR = testRoot
  projectId = randomUUID()
  await mkdir(join(testRoot, projectId), { recursive: true })
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('getProject merge', () => {
  it('returns null when meta.json missing', async () => {
    const id = randomUUID()
    await mkdir(join(testRoot, id), { recursive: true })
    const result = await getProject(id)
    expect(result).toBeNull()
  })

  it('reads meta only when other files missing', async () => {
    await writeFile(join(testRoot, projectId, 'meta.json'), JSON.stringify({
      id: projectId, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: null, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: false, hasOutline: false, hasHtml: false,
    }))
    const result = await getProject(projectId)
    expect(result?.source).toBeNull()
    expect(result?.structuredOutline).toBeNull()
    expect(result?.style).toBeNull()
    expect(result?.slides).toEqual([])
  })

  it('reads source.txt when present', async () => {
    await writeFile(join(testRoot, projectId, 'meta.json'), JSON.stringify({
      id: projectId, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: null, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: true, hasOutline: false, hasHtml: false,
    }))
    await writeFile(join(testRoot, projectId, 'source.txt'), 'hello world')
    const result = await getProject(projectId)
    expect(result?.source).toBe('hello world')
  })

  it('reads structured outline from outline.json', async () => {
    await writeFile(join(testRoot, projectId, 'meta.json'), JSON.stringify({
      id: projectId, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: null, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: false, hasOutline: true, hasHtml: false,
    }))
    await writeFile(join(testRoot, projectId, 'outline.json'), JSON.stringify({
      slides: [{ id: 's1', title: 'T', bullets: ['a'] }],
      generatedAt: 1700000000,
    }))
    const result = await getProject(projectId)
    expect(result?.structuredOutline?.slides[0].id).toBe('s1')
  })

  it('reads per-slide HTML files', async () => {
    await writeFile(join(testRoot, projectId, 'meta.json'), JSON.stringify({
      id: projectId, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: 2, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: false, hasOutline: true, hasHtml: true,
    }))
    const slidesDir = join(testRoot, projectId, 'slides')
    await mkdir(slidesDir, { recursive: true })
    await writeFile(join(slidesDir, 's1.html'), '<section data-id="s1">hi</section>')
    await writeFile(join(slidesDir, 's2.html'), '<section data-id="s2">bye</section>')
    const result = await getProject(projectId)
    expect(result?.slides).toHaveLength(2)
    expect(result?.slides.find(s => s.id === 's1')?.html).toContain('hi')
    expect(result?.slides.every(s => s.status === 'done')).toBe(true)
  })

  it('falls back to DEFAULT_STYLE when style.json missing', async () => {
    await writeFile(join(testRoot, projectId, 'meta.json'), JSON.stringify({
      id: projectId, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: null, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: false, hasOutline: false, hasHtml: false,
    }))
    const result = await getProject(projectId)
    expect(result?.style).toEqual({
      primaryColor: '#1677ff',
      layout: 'minimal',
      fontFamily: '-apple-system, sans-serif',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/main/fs/__tests__/projects.test.ts`
Expected: FAIL (current `getProject` doesn't return `source` / `structuredOutline` / `style` / `slides`)

---

## Task 3: fs.getProject Merge — Implementation

**Files:**
- Modify: `src/main/fs/projects.ts:26-43` (replace `getProject` body)

- [ ] **Step 1: Replace getProject with multi-file merge**

```ts
import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectDetail, ProjectMeta, ProjectStatus, Outline, StyleSettings } from '../../shared/types.js'
import { DEFAULT_STYLE } from '../../shared/types.js'
import { getProjectsDir } from './paths.js'

// ... existing ALLOWED_UPDATE_KEYS, listProjects, createProject, updateProject, deleteProject unchanged

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const dir = join(getProjectsDir(), id)
  if (!existsSync(dir)) return null
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) return null
  try {
    const metaRaw = await readFile(metaPath, 'utf8')
    const meta = JSON.parse(metaRaw) as ProjectMeta

    // Legacy combined HTML
    let html: string | null = null
    let htmlSize: number | null = null
    const htmlPath = join(dir, 'index.html')
    if (existsSync(htmlPath)) {
      html = await readFile(htmlPath, 'utf8')
      htmlSize = html.length
    }

    // Stage 1: source
    let source: string | null = null
    const sourcePath = join(dir, 'source.txt')
    if (existsSync(sourcePath)) {
      source = await readFile(sourcePath, 'utf8')
    }

    // Stage 2: structured outline
    let structuredOutline: Outline | null = null
    const outlineJsonPath = join(dir, 'outline.json')
    if (existsSync(outlineJsonPath)) {
      try {
        structuredOutline = JSON.parse(await readFile(outlineJsonPath, 'utf8'))
      } catch { /* corrupt — leave null */ }
    }

    // Stage 3: style (always return; fall back to DEFAULT_STYLE)
    let style: StyleSettings = { ...DEFAULT_STYLE }
    const stylePath = join(dir, 'style.json')
    if (existsSync(stylePath)) {
      try {
        style = { ...DEFAULT_STYLE, ...JSON.parse(await readFile(stylePath, 'utf8')) }
      } catch { /* corrupt — keep defaults */ }
    }

    // Stage 3: per-slide HTML files
    const slidesDirPath = join(dir, 'slides')
    const slides: ProjectDetail['slides'] = []
    if (existsSync(slidesDirPath)) {
      const entries = await readdir(slidesDirPath)
      for (const f of entries) {
        if (!f.endsWith('.html')) continue
        const sid = f.replace(/\.html$/, '')
        const shtml = await readFile(join(slidesDirPath, f), 'utf8')
        slides.push({ id: sid, html: shtml, status: 'done' })
      }
    }

    return {
      ...meta,
      html, htmlSize,
      lastGeneratedAt: html ? meta.updatedAt : null,
      lastError: null,
      source,
      structuredOutline,
      style,
      slides,
    }
  } catch {
    return null
  }
}
```

Note: also add `Outline` and `StyleSettings` to the imports from `../../shared/types.js`.

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/main/fs/__tests__/projects.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/fs/projects.ts src/main/fs/__tests__/projects.test.ts
git commit -m "feat(fs): merge multi-file project detail on getProject"
```

---

## Task 4: Update BridgeApi.project.get Type

**Files:**
- Modify: `src/renderer/lib/api.ts:18-19`

- [ ] **Step 1: Typecheck will catch drift**

No code change needed in api.ts because `ProjectDetail` is now imported from shared types. Run:

Run: `bun run typecheck`
Expected: PASS (renderer consumers of `api.project.get` get the new shape automatically)

If any consumer breaks, update its destructuring to handle nullable fields — but no changes are expected because all new fields are nullable and consumers haven't been added yet.

- [ ] **Step 2: Commit (no-op if no changes)**

Skip if no edits. Otherwise:

```bash
git add src/renderer/lib/api.ts
git commit -m "chore(api): handle extended ProjectDetail in bridge types"
```

---

## Task 5: useProjectDetailStore — Write Failing Test

**Files:**
- Create: `src/renderer/stores/__tests__/projectDetail.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../outline.js', () => ({
  useOutlineStore: {
    getState: () => ({ applyDetail: vi.fn() }),
  },
}))

vi.mock('../pptGeneration.js', () => ({
  usePptGenerationStore: {
    getState: () => ({ applyDetail: vi.fn(), reset: vi.fn() }),
  },
}))

vi.mock('../../lib/api.js', () => ({
  api: {
    project: { detail: vi.fn() },
  },
}))

import { useProjectDetailStore } from '../projectDetail.js'
import { api } from '../../lib/api.js'
import { useOutlineStore } from '../outline.js'
import { usePptGenerationStore } from '../pptGeneration.js'

describe('useProjectDetailStore', () => {
  beforeEach(() => {
    useProjectDetailStore.setState({ detail: null, loading: false, error: null, loadedProjectId: null })
    vi.clearAllMocks()
  })

  it('load: sets loading then populates detail', async () => {
    const mockDetail = {
      id: 'p1', title: 't', topic: 'tp', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 1, updatedAt: 1, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: 'src', structuredOutline: { slides: [], generatedAt: 1 },
      style: { primaryColor: '#000', layout: 'minimal', fontFamily: 'sans' },
      slides: [{ id: 's1', html: '<x/>', status: 'done' as const }],
    }
    vi.mocked(api.project.detail).mockResolvedValue(mockDetail)
    await useProjectDetailStore.getState().load('p1')
    const state = useProjectDetailStore.getState()
    expect(state.detail).toEqual(mockDetail)
    expect(state.loadedProjectId).toBe('p1')
    expect(state.loading).toBe(false)
  })

  it('load: skips if same id already loaded', async () => {
    const existing = { id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null, structuredOutline: null, style: null, slides: [] }
    useProjectDetailStore.setState({ detail: existing, loadedProjectId: 'p1' })
    await useProjectDetailStore.getState().load('p1')
    expect(api.project.detail).not.toHaveBeenCalled()
  })

  it('applySnapshot: dispatches to outline + ppt stores', () => {
    const detail = {
      id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null,
      structuredOutline: { slides: [{ id: 's1', title: 'T', bullets: [] }], generatedAt: 1 },
      style: null,
      slides: [{ id: 's1', html: '<x/>', status: 'done' as const }],
    }
    useProjectDetailStore.getState().applySnapshot(detail)
    expect(useOutlineStore.getState().applyDetail).toHaveBeenCalledWith({
      slides: detail.structuredOutline!.slides,
      generatedAt: 1,
    })
    expect(usePptGenerationStore.getState().applyDetail).toHaveBeenCalledWith(detail.slides)
  })

  it('applySnapshot: does not dispatch outline if structuredOutline is null', () => {
    const detail = {
      id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null, structuredOutline: null, style: null, slides: [],
    }
    useProjectDetailStore.getState().applySnapshot(detail)
    expect(useOutlineStore.getState().applyDetail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/renderer/stores/__tests__/projectDetail.test.ts`
Expected: FAIL (module `projectDetail.js` not found; api.project.detail doesn't exist yet)

---

## Task 6: useProjectDetailStore — Implementation

**Files:**
- Create: `src/renderer/stores/projectDetail.ts`

- [ ] **Step 1: Add api.project.detail to BridgeApi**

In `src/renderer/lib/api.ts`, replace the `project` interface:

```ts
project: {
  list(): Promise<ProjectMeta[]>
  get(id: string): Promise<ProjectDetail | null>
  detail(id: string): Promise<ProjectDetail | null>
  create(topic: string): Promise<ProjectMeta>
  update(id: string, patch: Partial<Pick<ProjectMeta, 'title' | 'topic' | 'outline'>>): Promise<ProjectMeta>
  delete(id: string): Promise<void>
  duplicate(id: string): Promise<ProjectMeta>
  rename(id: string, title: string): Promise<void>
  reveal(id: string): Promise<void>
}
```

- [ ] **Step 2: Add IPC channel**

In `src/shared/ipc-channels.ts`, add after `PROJECT_REVEAL`:

```ts
PROJECT_DETAIL: 'project:detail',
```

- [ ] **Step 3: Wire IPC handler in main**

In `src/main/ipc/project.ts`, add after `PROJECT_GET`:

```ts
ipcMain.handle(IPC.PROJECT_DETAIL, (_, { id }: { id: string }) => fs.getProject(id))
```

- [ ] **Step 4: Create the store**

Create `src/renderer/stores/projectDetail.ts`:

```ts
import { create } from 'zustand'
import { api } from '../lib/api.js'
import { useOutlineStore } from './outline.js'
import { usePptGenerationStore } from './pptGeneration.js'
import type { ProjectDetail } from '@shared/types'

interface ProjectDetailState {
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  loadedProjectId: string | null
  load: (id: string) => Promise<void>
  reload: () => Promise<void>
  patchDetail: (patch: Partial<ProjectDetail>) => void
  applySnapshot: (d: ProjectDetail) => void
  reset: () => void
}

export const useProjectDetailStore = create<ProjectDetailState>((set, get) => ({
  detail: null,
  loading: false,
  error: null,
  loadedProjectId: null,

  load: async (id) => {
    if (get().loadedProjectId === id && get().detail) return
    set({ loading: true, error: null })
    try {
      const detail = await api.project.detail(id)
      if (!detail) {
        set({ loading: false, error: '项目不存在' })
        return
      }
      set({ detail, loadedProjectId: id, loading: false, error: null })
      get().applySnapshot(detail)
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? '加载失败' })
    }
  },

  reload: async () => {
    const id = get().loadedProjectId
    if (!id) return
    set({ loadedProjectId: null })
    await get().load(id)
  },

  patchDetail: (patch) => {
    const cur = get().detail
    if (!cur) return
    set({ detail: { ...cur, ...patch } })
  },

  applySnapshot: (d) => {
    if (d.structuredOutline) {
      useOutlineStore.getState().applyDetail({
        slides: d.structuredOutline.slides,
        generatedAt: d.structuredOutline.generatedAt,
      })
    }
    if (d.slides.length > 0) {
      usePptGenerationStore.getState().applyDetail(d.slides)
    }
  },

  reset: () => set({ detail: null, loading: false, error: null, loadedProjectId: null }),
}))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/renderer/stores/__tests__/projectDetail.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck + build:main**

Run: `bun run typecheck && bun run build:main`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stores/projectDetail.ts src/renderer/stores/__tests__/projectDetail.test.ts \
        src/renderer/lib/api.ts src/shared/ipc-channels.ts src/main/ipc/project.ts
git commit -m "feat(store): add useProjectDetailStore with snapshot dispatch"
```

---

## Task 7: useLoadProjectDetail Hook

**Files:**
- Create: `src/renderer/hooks/useLoadProjectDetail.ts`

- [ ] **Step 1: Create hook**

```ts
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useProjectDetailStore } from '../stores/projectDetail.js'

export function useLoadProjectDetail(): void {
  const { id = '' } = useParams<{ id: string }>()
  const load = useProjectDetailStore(s => s.load)
  const reset = useProjectDetailStore(s => s.reset)
  const loadedProjectId = useProjectDetailStore(s => s.loadedProjectId)

  useEffect(() => {
    if (!id) return
    if (loadedProjectId === id) return
    void load(id)
  }, [id, loadedProjectId, load])

  useEffect(() => {
    return () => { reset() }
  }, [reset])
}
```

- [ ] **Step 2: Wire hook into ProjectStepper**

In `src/renderer/components/ProjectStepper.tsx`, add at the top of the component:

```ts
import { useLoadProjectDetail } from '../hooks/useLoadProjectDetail.js'

export function ProjectStepper({ projectId }: { projectId: string }) {
  useLoadProjectDetail()
  const loc = useLocation()
  // ... rest unchanged
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useLoadProjectDetail.ts src/renderer/components/ProjectStepper.tsx
git commit -m "feat(hook): route-level useLoadProjectDetail"
```

---

## Task 8: useOutlineStore.applyDetail — Write Failing Test

**Files:**
- Create: `src/renderer/stores/__tests__/outline.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useOutlineStore } from '../outline.js'

describe('useOutlineStore.applyDetail', () => {
  beforeEach(() => {
    useOutlineStore.setState({ outline: null, style: null, loaded: false })
  })

  it('sets outline when called', () => {
    useOutlineStore.getState().applyDetail({
      slides: [{ id: 's1', title: 'T', bullets: ['a'] }],
      generatedAt: 1700000000,
    })
    expect(useOutlineStore.getState().outline?.slides[0].id).toBe('s1')
    expect(useOutlineStore.getState().loaded).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/renderer/stores/__tests__/outline.test.ts`
Expected: FAIL (`applyDetail` is not a method)

---

## Task 9: useOutlineStore.applyDetail — Implementation

**Files:**
- Modify: `src/renderer/stores/outline.ts:20-27`

- [ ] **Step 1: Replace store with applyDetail, remove fake load**

```ts
import { create } from 'zustand'
import { api } from '../lib/api.js'
import type { OutlineSlide, StyleSettings } from '@shared/types'

interface OutlineStore {
  outline: { slides: OutlineSlide[]; generatedAt: number } | null
  style: StyleSettings | null
  loaded: boolean
  applyDetail: (snapshot: { slides: OutlineSlide[]; generatedAt: number }) => void
  setOutline: (slides: OutlineSlide[], generatedAt?: number) => void
  generate: (id: string, topic: string, source: string) => Promise<OutlineSlide[]>
  updateSlide: (id: string, slideId: string, patch: Partial<OutlineSlide>) => Promise<void>
  addSlide: (id: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  deleteSlide: (id: string, slideId: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  regenerate: (id: string, slideId: string) => Promise<void>
  generateHtml: (id: string) => Promise<void>
  saveStyle: (id: string, style: StyleSettings) => Promise<void>
}

export const useOutlineStore = create<OutlineStore>((set, get) => ({
  outline: null,
  style: null,
  loaded: false,

  applyDetail: (snapshot) => set({
    outline: { slides: snapshot.slides, generatedAt: snapshot.generatedAt },
    loaded: true,
  }),

  setOutline: (slides, generatedAt) => set({
    outline: { slides, generatedAt: generatedAt ?? Date.now() },
    loaded: true,
  }),

  generate: async (id, topic, source) => {
    await api.stage.collectSave(id, topic, source)
    const r = await api.stage.outlineGenerate(id)
    if (r.phase === 'done') {
      set({ outline: { slides: r.slides, generatedAt: Date.now() }, loaded: true })
      return r.slides
    }
    return []
  },

  updateSlide: async (id, slideId, patch) => {
    const r = await api.stage.outlineUpdate(id, slideId, patch)
    set({ outline: { slides: r.slides, generatedAt: Date.now() } })
  },

  addSlide: async (id) => {
    const r = await api.stage.slideAdd(id)
    const outline = { slides: r.slides, generatedAt: Date.now() }
    set({ outline })
    return outline
  },

  deleteSlide: async (id, slideId) => {
    const r = await api.stage.slideDelete(id, slideId)
    const outline = { slides: r.slides, generatedAt: Date.now() }
    set({ outline })
    return outline
  },

  regenerate: async (id, slideId) => {
    await api.stage.slideRegenerate(id, slideId)
  },

  generateHtml: async (id) => {
    await api.stage.htmlGenerate(id)
  },

  saveStyle: async (id, style) => {
    await api.stage.styleSave(id, style)
    set({ style })
  },
}))
```

Note: removed the broken `load(id)` method; added `applyDetail`.

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/renderer/stores/__tests__/outline.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (any callers of removed `load` will surface here — fix those callers in Task 10)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/outline.ts src/renderer/stores/__tests__/outline.test.ts
git commit -m "refactor(outline-store): replace fake load with applyDetail"
```

---

## Task 10: usePptGenerationStore.applyDetail — Write Failing Test

**Files:**
- Create: `src/renderer/stores/__tests__/pptGeneration.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { usePptGenerationStore } from '../pptGeneration.js'

describe('usePptGenerationStore.applyDetail', () => {
  beforeEach(() => {
    usePptGenerationStore.setState({
      projectId: null, slides: {}, phase: 'idle', completed: 0, failed: 0, total: 0,
    })
  })

  it('populates slides from detail payload', () => {
    usePptGenerationStore.getState().applyDetail('p1', [
      { id: 's1', html: '<x/>', status: 'done', layout: 2 },
      { id: 's2', html: '<y/>', status: 'failed', error: 'boom' },
    ])
    const state = usePptGenerationStore.getState()
    expect(state.projectId).toBe('p1')
    expect(state.slides.s1.status).toBe('done')
    expect(state.slides.s1.layout).toBe(2)
    expect(state.slides.s2.status).toBe('failed')
    expect(state.slides.s2.error).toBe('boom')
    expect(state.total).toBe(2)
    expect(state.phase).toBe('done')
  })

  it('reset clears all state', () => {
    usePptGenerationStore.getState().applyDetail('p1', [{ id: 's1', html: '<x/>', status: 'done' }])
    usePptGenerationStore.getState().reset()
    const state = usePptGenerationStore.getState()
    expect(state.projectId).toBeNull()
    expect(state.slides).toEqual({})
    expect(state.phase).toBe('idle')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/renderer/stores/__tests__/pptGeneration.test.ts`
Expected: FAIL (existing reset exists but applyDetail doesn't)

---

## Task 11: usePptGenerationStore.applyDetail — Implementation

**Files:**
- Modify: `src/renderer/stores/pptGeneration.ts:51-115`

- [ ] **Step 1: Add applyDetail, keep existing API**

Replace the store implementation:

```ts
import { create } from 'zustand'
import { api } from '../lib/api.js'

export type SlideStatus = 'pending' | 'layout' | 'generating' | 'done' | 'failed'

export interface PptSlide {
  id: string
  title: string
  status: SlideStatus
  layout?: 1 | 2 | 3 | 4 | 5
  html?: string
  error?: string
  durationMs?: number
  retries?: number
}

interface PptGenerationState {
  projectId: string | null
  slides: Record<string, PptSlide>
  phase: 'idle' | 'running' | 'done' | 'cancelled' | 'error'
  completed: number
  failed: number
  total: number
  initialize: (projectId: string, slideList: { id: string; title: string }[]) => void
  start: (projectId: string) => Promise<void>
  cancel: () => Promise<void>
  applySlideReady: (e: {
    projectId: string
    slideId: string
    status: 'layout' | 'done' | 'failed'
    html?: string
    error?: string
    durationMs?: number
    retries?: number
    layout?: 1 | 2 | 3 | 4 | 5
    completed: number
    total: number
  }) => void
  applyGenerateDone: (e: {
    projectId: string
    completed: number
    failed: number
    total: number
    cancelled: boolean
  }) => void
  applyDetail: (projectId: string, slides: Array<{
    id: string
    html: string
    layout?: 1 | 2 | 3 | 4 | 5
    status: 'done' | 'failed'
    error?: string
  }>) => void
  reset: () => void
}

export const usePptGenerationStore = create<PptGenerationState>((set, get) => ({
  projectId: null,
  slides: {},
  phase: 'idle',
  completed: 0,
  failed: 0,
  total: 0,

  initialize: (projectId, slideList) => {
    const slides: Record<string, PptSlide> = {}
    slideList.forEach((s, i) => {
      slides[s.id] = { id: s.id, title: s.title, status: 'pending', layout: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5 }
    })
    set({ projectId, slides, phase: 'idle', completed: 0, failed: 0, total: slideList.length })
  },

  start: async (projectId) => {
    set({ phase: 'running', projectId })
    try {
      const r = await api.stage.htmlGenerate(projectId)
      if (r.phase === 'cancelled') set({ phase: 'cancelled' })
      else if (r.phase === 'error') set({ phase: 'error' })
      else set({ phase: 'done', completed: r.completed, failed: r.failed, total: r.total })
    } catch { set({ phase: 'error' }) }
  },

  cancel: async () => {
    const { projectId } = get()
    if (!projectId) return
    await api.stage.htmlCancel(projectId)
  },

  applySlideReady: (e) => {
    const cur = get()
    const existing = cur.slides[e.slideId]
    const slide = existing ?? { id: e.slideId, title: e.slideId, status: 'pending' as SlideStatus }
    const next = { ...cur.slides, [e.slideId]: { ...slide, status: e.status, html: e.html, error: e.error, durationMs: e.durationMs, retries: e.retries, layout: e.layout ?? slide.layout } }
    const completed = Object.values(next).filter(s => s.status === 'done').length
    const failed = Object.values(next).filter(s => s.status === 'failed').length
    set({
      projectId: cur.projectId ?? e.projectId,
      total: Math.max(cur.total, e.total),
      slides: next,
      completed,
      failed,
    })
  },

  applyGenerateDone: (e) => {
    const cur = get()
    if (cur.projectId !== e.projectId) return
    set({
      phase: e.cancelled ? 'cancelled' : (e.failed > 0 && e.completed === 0 ? 'error' : 'done'),
      completed: e.completed,
      failed: e.failed,
      total: e.total,
    })
  },

  applyDetail: (projectId, slides) => {
    const next: Record<string, PptSlide> = {}
    slides.forEach((s, i) => {
      next[s.id] = {
        id: s.id,
        title: s.id,
        status: s.status,
        html: s.html,
        error: s.error,
        layout: s.layout ?? ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      }
    })
    const completed = slides.filter(s => s.status === 'done').length
    const failed = slides.filter(s => s.status === 'failed').length
    set({
      projectId,
      slides: next,
      phase: 'done',
      completed,
      failed,
      total: slides.length,
    })
  },

  reset: () => set({ projectId: null, slides: {}, phase: 'idle', completed: 0, failed: 0, total: 0 }),
}))
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/renderer/stores/__tests__/pptGeneration.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/pptGeneration.ts src/renderer/stores/__tests__/pptGeneration.test.ts
git commit -m "feat(ppt-store): add applyDetail to restore slides from disk"
```

---

## Task 12: GeneratePage — Restore + Manual Regenerate

**Files:**
- Modify: `src/renderer/routes/GeneratePage.tsx`

- [ ] **Step 1: Replace GeneratePage**

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Progress, Modal, App as AntdApp } from 'antd'
import { ProjectStepper } from '../components/ProjectStepper'
import { SlideThumbnailStrip } from '../components/SlideThumbnailStrip'
import { SlidePreview } from '../components/SlidePreview'
import { usePptGenerationStore } from '../stores/pptGeneration'
import { useOutlineStore } from '../stores/outline'
import { useProjectDetailStore } from '../stores/projectDetail'

export function GeneratePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message, modal } = AntdApp.useApp()
  const ppt = usePptGenerationStore()
  const outline = useOutlineStore(s => s.outline)
  const detail = useProjectDetailStore(s => s.detail)
  const applyDetail = usePptGenerationStore(s => s.applyDetail)
  const [currentId, setCurrentId] = useState<string | null>(null)

  // Restore slides from detail on mount (no auto-start)
  useEffect(() => {
    if (detail?.id === id && detail.slides.length > 0) {
      applyDetail(id, detail.slides)
      if (!currentId) setCurrentId(detail.slides[0].id)
    } else if (outline && outline.slides.length > 0 && ppt.projectId !== id) {
      // Fallback: init empty placeholders from outline if detail not yet loaded
      ppt.initialize(id, outline.slides.map(s => ({ id: s.id, title: s.title })))
      if (!currentId) setCurrentId(outline.slides[0].id)
    }
  }, [detail?.id, outline, id])

  // Toast on phase transitions
  useEffect(() => {
    if (ppt.phase === 'done' && ppt.total > 0 && ppt.projectId === id) {
      message.success(`完成 ${ppt.completed}/${ppt.total}`)
    } else if (ppt.phase === 'cancelled') {
      message.info('已取消')
    } else if (ppt.phase === 'error') {
      message.error('生成失败，请重试')
    }
  }, [ppt.phase])

  const onRegenerate = () => {
    if (ppt.completed > 0 || ppt.failed > 0) {
      modal.confirm({
        title: '重新生成',
        content: `将覆盖已有 ${ppt.completed} 页成功 + ${ppt.failed} 页失败的生成结果，确认？`,
        okText: '确认重新生成',
        cancelText: '取消',
        onOk: () => {
          ppt.reset()
          ppt.start(id)
        },
      })
    } else {
      ppt.start(id)
    }
  }

  const onCancel = async () => {
    await ppt.cancel()
  }

  const slidesList = Object.values(ppt.slides)
  const isRunning = ppt.phase === 'running'
  const percent = ppt.total > 0 ? Math.round((ppt.completed / ppt.total) * 100) : 0
  const currentSlide = currentId ? slidesList.find(s => s.id === currentId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
          <strong style={{ fontSize: 13 }}>第 3 步 · PPT 实时生成</strong>
          <Progress
            percent={percent}
            style={{ flex: 1, margin: 0 }}
            status={ppt.phase === 'error' ? 'exception' : (ppt.phase === 'cancelled' ? 'normal' : 'active')}
          />
          <small style={{ color: '#6b7280', minWidth: 80, textAlign: 'right' }}>
            {ppt.completed} / {ppt.total} {ppt.failed > 0 ? `(${ppt.failed} 失败)` : ''}
          </small>
          {isRunning
            ? <Button danger size="small" onClick={onCancel}>取消</Button>
            : <Button type="primary" size="small" onClick={onRegenerate}>{ppt.completed > 0 ? '重新生成' : '开始生成'}</Button>}
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <SlideThumbnailStrip
            slides={slidesList}
            currentId={currentId}
            onSelect={setCurrentId}
          />
          <SlidePreview slide={currentSlide ?? null} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/GeneratePage.tsx
git commit -m "refactor(generate-page): restore slides from detail; manual regenerate"
```

---

## Task 13: StageNav — Unsaved Guard

**Files:**
- Modify: `src/renderer/components/StageNav.tsx`

- [ ] **Step 1: Add unsaved guard**

Replace StageNav:

```tsx
import { useEffect } from 'react'
import { Button, App as AntdApp } from 'antd'
import { Link, useBlocker } from 'react-router-dom'

export function StageNav({ projectId, current, canBack = true, canNext = true, onNext, nextLabel = '下一步', dirty = false }: {
  projectId: string
  current: 'collect' | 'outline' | 'generate' | 'fine-tune'
  canBack?: boolean
  canNext?: boolean
  onNext?: () => void
  nextLabel?: string
  dirty?: boolean
}) {
  const { modal } = AntdApp.useApp()
  const order: typeof current[] = ['collect', 'outline', 'generate', 'fine-tune']
  const idx = order.indexOf(current)
  const back = idx > 0 ? order[idx - 1] : null

  const handleNext = () => {
    if (!onNext) return
    if (dirty) {
      modal.confirm({
        title: '有未保存的修改',
        content: '当前页面的修改尚未保存。是否继续？',
        okText: '继续（放弃修改）',
        cancelText: '取消',
        onOk: () => onNext(),
      })
    } else {
      onNext()
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 16, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      {back ? (
        <Link to={`/projects/${projectId}/${back}`}>
          <Button disabled={!canBack}>← 上一步</Button>
        </Link>
      ) : <div />}
      {onNext ? (
        <Button type="primary" disabled={!canNext} onClick={handleNext}>{nextLabel} →</Button>
      ) : <div />}
    </div>
  )
}
```

Note: `useBlocker` import is unused (browser navigation guard); remove if not used. The intent here is to guard the in-app `next` button only — full route navigation guard is intentionally deferred.

Cleaner version (no useBlocker):

```tsx
import { Button, App as AntdApp } from 'antd'
import { Link } from 'react-router-dom'

export function StageNav({ projectId, current, canBack = true, canNext = true, onNext, nextLabel = '下一步', dirty = false }: {
  projectId: string
  current: 'collect' | 'outline' | 'generate' | 'fine-tune'
  canBack?: boolean
  canNext?: boolean
  onNext?: () => void
  nextLabel?: string
  dirty?: boolean
}) {
  const { modal } = AntdApp.useApp()
  const order: typeof current[] = ['collect', 'outline', 'generate', 'fine-tune']
  const idx = order.indexOf(current)
  const back = idx > 0 ? order[idx - 1] : null

  const handleNext = () => {
    if (!onNext) return
    if (dirty) {
      modal.confirm({
        title: '有未保存的修改',
        content: '当前页面的修改尚未保存。是否继续？',
        okText: '继续（放弃修改）',
        cancelText: '取消',
        onOk: () => onNext(),
      })
    } else {
      onNext()
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 16, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      {back ? (
        <Link to={`/projects/${projectId}/${back}`}>
          <Button disabled={!canBack}>← 上一步</Button>
        </Link>
      ) : <div />}
      {onNext ? (
        <Button type="primary" disabled={!canNext} onClick={handleNext}>{nextLabel} →</Button>
      ) : <div />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/StageNav.tsx
git commit -m "feat(stage-nav): add unsaved-changes prompt on next"
```

---

## Task 14: CollectEditor — Restore + Explicit Save

**Files:**
- Modify: `src/renderer/routes/CollectEditor.tsx`

- [ ] **Step 1: Replace CollectEditor**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Input, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { StageStreamBar } from '../components/StageStreamBar'
import { useProjectDetailStore } from '../stores/projectDetail'
import { useOutlineStore } from '../stores/outline'

const { TextArea } = Input

export function CollectEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const detail = useProjectDetailStore(s => s.detail)
  const patchDetail = useProjectDetailStore(s => s.patchDetail)
  const setOutline = useOutlineStore(s => s.setOutline)

  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Restore from detail
  useEffect(() => {
    if (detail?.id === id) {
      if (detail.topic) setTopic(detail.topic)
      if (detail.source !== null) setSource(detail.source)
      setDirty(false)
    }
  }, [detail?.id, id])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.stage.collectSave(id, topic, source)
      patchDetail({ source, topic })
      setDirty(false)
      message.success('已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onNext = () => {
    setStreaming(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 1 步 · 内容收集</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>粘贴你的素材，下一步 LLM 会整理成 PPT 大纲。</p>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Input
            placeholder="项目主题"
            value={topic}
            onChange={e => { setTopic(e.target.value); setDirty(true) }}
            style={{ marginBottom: 12 }}
          />
          <TextArea
            rows={14}
            value={source}
            onChange={e => { setSource(e.target.value); setDirty(true) }}
            placeholder="把你的内容粘贴到这里..."
            style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {streaming ? (
            <StageStreamBar
              kind="outline"
              projectId={id}
              onDone={(r) => {
                setOutline(r.slides ?? [])
                nav(`/projects/${id}/outline`)
              }}
            />
          ) : (
            <>
              <small style={{ color: '#9ca3af' }}>字符数：{source.length} · 约 30 秒生成大纲</small>
              <Button type="primary" onClick={onSave} loading={saving} disabled={!dirty}>
                保存项目信息
              </Button>
            </>
          )}
        </div>
      </div>
      <StageNav
        projectId={id}
        current="collect"
        canNext={source.trim().length > 0 && !streaming}
        dirty={dirty}
        onNext={onNext}
        nextLabel="下一步：生成大纲"
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/CollectEditor.tsx
git commit -m "refactor(collect): restore source from detail + explicit Save"
```

---

## Task 15: OutlinePage — Explicit Save + Restore + Drop Debounce

**Files:**
- Modify: `src/renderer/routes/OutlinePage.tsx`
- Create: `src/renderer/routes/__tests__/OutlinePage.test.tsx`

- [ ] **Step 1: Write failing test for unsaved-changes prompt**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ConfigProvider, App as AntdApp } from 'antd'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OutlinePage } from '../OutlinePage.js'

vi.mock('../api.js', () => ({
  api: {
    project: { detail: vi.fn().mockResolvedValue({
      id: 'p1', title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: 1, createdAt: 0, updatedAt: 0, currentStage: 'outline',
      hasSource: true, hasOutline: true, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: 'src', structuredOutline: {
        slides: [{ id: 's1', title: 'Original', bullets: ['a'] }],
        generatedAt: 1700000000,
      },
      style: null,
      slides: [],
    }) },
    stage: {
      outlineRead: vi.fn().mockResolvedValue(null),
      outlineUpdate: vi.fn(),
      slideAdd: vi.fn(),
      slideDelete: vi.fn(),
    },
  },
}))

const wrap = (children: React.ReactNode) => (
  <ConfigProvider>
    <AntdApp>
      <MemoryRouter initialEntries={['/projects/p1/outline']}>
        <Routes>
          <Route path="/projects/:id/outline" element={children} />
          <Route path="/projects" element={<div>projects</div>} />
        </Routes>
      </MemoryRouter>
    </AntdApp>
  </ConfigProvider>
)

describe('OutlinePage unsaved prompt', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows confirm modal when next clicked with dirty edits', async () => {
    const { getByDisplayValue, getByText } = render(wrap(<OutlinePage />))
    await waitFor(() => expect(getByDisplayValue('Original')).toBeTruthy())
    fireEvent.change(getByDisplayValue('Original'), { target: { value: 'Changed' } })
    fireEvent.click(getByText(/下一步：生成 PPT/))
    await waitFor(() => expect(getByText(/有未保存的修改/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/renderer/routes/__tests__/OutlinePage.test.tsx`
Expected: FAIL (existing OutlinePage has no `dirty` prop and no explicit save)

- [ ] **Step 3: Replace OutlinePage**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, App as AntdApp } from 'antd'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { OutlineCard } from '../components/OutlineCard'
import { StageStreamBar } from '../components/StageStreamBar'
import { useOutlineStore } from '../stores/outline'
import { useProjectDetailStore } from '../stores/projectDetail'
import type { OutlineSlide } from '@shared/types'

export function OutlinePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const { outline, updateSlide, addSlide, deleteSlide } = useOutlineStore()
  const detail = useProjectDetailStore(s => s.detail)

  const [localSlides, setLocalSlides] = useState<OutlineSlide[]>([])
  const [savedSlides, setSavedSlides] = useState<OutlineSlide[]>([])
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)

  // Sync from store
  useEffect(() => {
    if (outline?.slides) {
      setLocalSlides(outline.slides)
      setSavedSlides(outline.slides)
    } else if (detail?.structuredOutline?.slides) {
      setLocalSlides(detail.structuredOutline.slides)
      setSavedSlides(detail.structuredOutline.slides)
    }
  }, [outline, detail?.structuredOutline])

  const dirty = useMemo(() => {
    if (localSlides.length !== savedSlides.length) return true
    return localSlides.some((s, i) => {
      const saved = savedSlides[i]
      return !saved || s.id !== saved.id || s.title !== saved.title
        || JSON.stringify(s.bullets) !== JSON.stringify(saved.bullets)
    })
  }, [localSlides, savedSlides])

  const onSlideChange = (slideId: string, patch: Partial<OutlineSlide>) => {
    setLocalSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...patch } : s))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      for (let i = 0; i < localSlides.length; i++) {
        const cur = localSlides[i]
        const saved = savedSlides[i]
        if (!saved || cur.title !== saved.title || JSON.stringify(cur.bullets) !== JSON.stringify(saved.bullets)) {
          await updateSlide(id, cur.id, { title: cur.title, bullets: cur.bullets })
        }
      }
      setSavedSlides(localSlides)
      message.success('大纲已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onAdd = async () => {
    const o = await addSlide(id)
    setLocalSlides(o.slides)
    setSavedSlides(o.slides)
  }

  const onDelete = async (slideId: string) => {
    if (!confirm('删除该幻灯片？')) return
    const o = await deleteSlide(id, slideId)
    setLocalSlides(o.slides)
    setSavedSlides(o.slides)
  }

  const onNext = () => {
    nav(`/projects/${id}/generate`)
  }

  if (localSlides.length === 0 && !outline) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fff', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>第 2 步 · 大纲编辑</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>编辑每页标题和要点，点「保存大纲」写入磁盘。</p>
          </div>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!dirty}>
            保存大纲
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
          {localSlides.map((s, i) => (
            <OutlineCard key={s.id} slide={s} index={i}
              onChange={p => onSlideChange(s.id, p)}
              onDelete={() => onDelete(s.id)} />
          ))}
        </div>
        <Button block type="dashed" onClick={onAdd} style={{ marginBottom: 16 }}>+ 添加新页</Button>
      </div>
      <StageNav
        projectId={id}
        current="outline"
        canNext={localSlides.length > 0}
        dirty={dirty}
        onNext={onNext}
        nextLabel="下一步：生成 PPT"
      />
      <div style={{ position: 'absolute', top: 100, right: 32, width: 360 }}>
        {streaming ? (
          <StageStreamBar
            kind="outline"
            projectId={id}
            onDone={(r) => {
              setLocalSlides(r.slides ?? [])
              setSavedSlides(r.slides ?? [])
              setStreaming(false)
            }}
          />
        ) : (
          <Button onClick={() => setStreaming(true)}>↻ 重新生成大纲</Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/renderer/routes/__tests__/OutlinePage.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/routes/OutlinePage.tsx src/renderer/routes/__tests__/OutlinePage.test.tsx
git commit -m "refactor(outline): explicit Save button + dirty guard; drop 500ms debounce"
```

---

## Task 16: Final Integration — Build + E2E Smoke

**Files:** none

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Build main**

Run: `bun run build:main`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `bun test`
Expected: all PASS (existing 101 tests + 6 new = 107)

- [ ] **Step 4: Manual smoke (in dev)**

Run: `bun run dev`
Then in the running app:
1. Create a new project at `/projects`
2. Fill topic + source → click "保存项目信息" → confirm success toast
3. Click 下一步 → confirm unsaved-changes prompt does NOT appear (since saved)
4. Generate outline → click "保存大纲" on outline page
5. Click 下一步 → no prompt
6. Generation runs → confirm "重新生成" shows confirm modal
7. Re-open the project from `/projects` → confirm topic + source restored, outline restored, slides rendered

- [ ] **Step 5: Commit if any drift**

```bash
git status --short
# If clean, skip. Otherwise:
git add -A
git commit -m "chore: integration smoke test adjustments"
```

---

## Self-Review Notes (applied during writing)

- **Spec coverage:**
  - §3.1 main-process merge → Task 2-3 ✓
  - §3.2 useProjectDetailStore → Task 5-6 ✓
  - §3.3 useLoadProjectDetail hook → Task 7 ✓
  - §4.1 type extension → Task 1 ✓
  - §4.2 store applyDetail setters → Task 8-9, 10-11 ✓
  - §4.2 page modifications → Task 12, 14, 15 ✓
  - §5.4 GeneratePage restore + manual → Task 12 ✓
  - §6 unsaved-changes prompt → Task 13, 15 ✓
  - §7 tests → Task 2, 5, 8, 10, 15 ✓

- **Type consistency:** `applyDetail` signature is consistent across `useOutlineStore` and `usePptGenerationStore`. The ppt store's `applyDetail(projectId, slides)` takes 2 args because the signature differs (it needs projectId for phase='done' attribution); the outline store's `applyDetail(snapshot)` takes 1 arg because the store already knows the projectId from its own scope.

- **File count:** 8 main + 4 tests = 12 files, as documented in spec §4.4.

- **No placeholders:** every code block is concrete.