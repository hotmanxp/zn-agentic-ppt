# Outline / Slide-Regen Streaming Progress + Cancel — Design

**Date:** 2026-06-19
**Status:** Draft (awaiting user review)
**Author:** OpenCC session resumed from handoff `zn-agentic-ppt-outline-prompt-fix-2026-06-19.md`

## Context

Stage 2 (outline generation) takes ~30s with `MiniMax-M3` and ~60s+ for full HTML PPT generation. The user sees only a static `loading` spinner on the button — no indication of progress. The IPC channel `STAGE_OUTLINE_STREAM` is already wired on the main side (the `onEvent` callback in `src/main/ipc/stage.ts:51` broadcasts every raw SDK message) and the preload bridge (`api.stage.onOutlineStream`) exposes it, but no renderer component subscribes.

The same UX problem applies to:
- `OutlinePage` "↻ 重新生成大纲" button (`src/renderer/routes/OutlinePage.tsx:95`)
- `FineTunePage` slide-regenerate button (`src/renderer/routes/FineTunePage.tsx:60`) — currently ~60s+

Stage 3 (HTML generation) already has working progress UI via `useGenerationStore` + `<GenerationProgress>` / `<HtmlStream>`. The goal is to bring the same visibility to outline and slide-regen flows, plus give the user a way to cancel a hung generation.

## Goal

While an outline or slide-regen LLM call is in flight, the renderer:
1. Shows a live character counter (e.g. "已生成 1,234 字符") with a progress bar.
2. For slide-regen, additionally streams the partial HTML into a collapsible preview pane.
3. Exposes a "取消" button that interrupts the LLM call.

## Non-Goals

- IPC handler timeouts (separate task; 90s deadline was suggested in handoff).
- Refactoring `useGenerationStore` / Stage 3 wiring (untouched).
- Renaming `outline` field in `RunnerOptions` (separate refactor).
- Live JSON parsing of partial outline (chose char counter; mid-stream JSON is rarely valid).

## Architecture

Four boundaries:

### 1. `src/main/ipc/stage.ts` — normalize + registry

**Module-level registry** (new):
```ts
type ActiveRun = { runner: GenerationRunner; kind: 'outline' | 'slide-regen'; projectId: string; slideId?: string }
const activeRuns = new Map<string, ActiveRun>()
```

**Key shape:**
- `outline` kind → `projectId`
- `slide-regen` kind → `${projectId}:${slideId}`

**Handler rewrites** (three handlers affected: `STAGE_OUTLINE_GENERATE`, `STAGE_SLIDE_REGENERATE`):
- Move runner creation, then `activeRuns.set(key, {runner, kind, projectId, slideId?})`.
- `onProgress({phase, current})` → `broadcast(STAGE_OUTLINE_STREAM | STAGE_SLIDE_STREAM, {runId: key, projectId, slideId?, kind, phase: 'streaming', chars: current, html?: currentHtml})`. The `html` field is only set for `slide-regen` (the runner currently accumulates `buffer` per text block — we re-use the same accumulation but expose a snapshot on each progress event).
- **Cancellation tracking** (required because the runner always emits `code: 'INTERNAL'` on both SDK errors and interrupt; we can't distinguish from `error.code` alone): maintain a sibling `Set<string>` called `cancelledKeys`. The cancel handler adds the key before calling `runner.interrupt()`. The `onError` callback reads `if (cancelledKeys.has(key)) { phase: 'cancelled'; cancelledKeys.delete(key) }` else `phase: 'error'`. Then `activeRuns.delete(key)`.
- `onDone({html, durationMs})` → `broadcast(..., {runId, projectId, slideId?, kind, phase: 'done', chars, html, durationMs})`. Then `activeRuns.delete(key)`. IPC handler resolves with `{phase: 'done', slides?, html?}` for callers that await.

**New IPC handlers:**
- `STAGE_OUTLINE_CANCEL({projectId})` → looks up `activeRuns.get(projectId)`, calls `runner.interrupt()`. The runner's SDK will throw, which routes through `onError` → `phase: 'cancelled'` broadcast. Resolves `{ok: true}`.
- `STAGE_SLIDE_CANCEL({projectId, slideId})` → looks up `activeRuns.get(`${projectId}:${slideId}`)`, same path.

### 2. `src/shared/ipc-channels.ts` — new channels

```ts
STAGE_OUTLINE_CANCEL: 'stage:outline-cancel',
STAGE_SLIDE_REGENERATE_STREAM: 'stage:slide-regenerate-stream',
STAGE_SLIDE_CANCEL: 'stage:slide-cancel',
```

(`STAGE_OUTLINE_STREAM` already exists.)

### 3. `src/preload/index.ts` + `src/renderer/lib/api.ts` — bridge

- Add `stage.outlineCancel(id)`, `stage.slideRegenerateStream(cb)`, `stage.slideCancel(id, slideId)`.
- Type the new payloads in `BridgeApi`:
  ```ts
  interface StageStreamEvent {
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

### 4. `src/renderer/stores/stageStream.ts` — new Zustand store

```ts
type Kind = 'outline' | 'slide-regen'
type Phase = 'idle' | 'streaming' | 'cancelling' | 'done' | 'error'
interface StageStreamState {
  projectId: string | null
  slideId: string | null
  kind: Kind | null
  phase: Phase
  chars: number
  html: string
  error: string | null
  start: (kind: Kind, projectId: string, slideId?: string) => Promise<{result: any}>
  cancel: () => Promise<void>
  reset: () => void
}
```

- `start()` sets `phase: 'streaming'`, calls the matching `api.stage.outlineGenerate` / `slideRegenerate` and awaits the IPC return (which now resolves with `{phase: 'done', ...}` or `{phase: 'cancelled'}` / `{phase: 'error'}`).
- The store's `set()` is also called from a top-level subscriber set up in `App.tsx` (or a small `useStageStreamSubscription` hook called once at the root) that listens to both `api.stage.onOutlineStream` and `api.stage.slideRegenerateStream`. It filters by `event.projectId === currentProjectId && event.slideId === currentSlideId` (for slide-regen) and updates store.
- `cancel()` calls the matching cancel IPC, sets `phase: 'cancelling'`.
- `reset()` sets back to idle.

### 5. `src/renderer/components/StageStreamBar.tsx` — shared UI

Props: `{ projectId: string; slideId?: string; kind: 'outline' | 'slide-regen'; onDone: (result: any) => void }`.

Behavior:
- Mounts with `phase === 'idle'`. Calls `useStageStreamStore.start(kind, projectId, slideId)` once on mount (useEffect with empty deps).
- Renders nothing while `phase === 'idle'`.
- Renders a progress card (Antd `Progress` + char counter + cancel button) while `phase` is `streaming` | `cancelling`.
- On `phase === 'done'`, calls `onDone(result)` and `reset()`. Parent caller replaces the original button.
- On `phase === 'cancelled' | 'error'`, shows toast and `reset()`.
- For `kind === 'slide-regen'`, additionally renders a collapsible `<HtmlStream html={store.html} />` below the progress.

### 6. Three callsite rewrites

| File | Before | After |
|------|--------|-------|
| `src/renderer/routes/CollectEditor.tsx` | `loading` state + "生成中..." text in `StageNav nextLabel`. | Remove `loading` and `generate` indirection. Replace the "下一步" button with: a regular button that, on click, mounts `<StageStreamBar kind="outline" projectId={id} onDone={...} />` and hides itself. |
| `src/renderer/routes/OutlinePage.tsx` | `generating` state + "↻ 重新生成大纲" button. | Replace the button. On click, mount `<StageStreamBar kind="outline" ... onDone={(r) => setLocalOutline({slides: r.slides, generatedAt: Date.now()})} />`. |
| `src/renderer/routes/FineTunePage.tsx` (or its child `SlideEditor.tsx`) | `regenerating` state + "重生成" button. | Replace the button. On click, mount `<StageStreamBar kind="slide-regen" projectId={id} slideId={currentId} onDone={() => message.success('页面已更新')} />` (with HTML preview enabled). |

Implementation detail: each callsite can keep its "trigger" button visible until `<StageStreamBar/>` takes over (toggle local boolean or read store's `phase !== 'idle'`).

## Data Flow

```
[user clicks "重新生成大纲"]
  → OutlinePage setLocalMountBar(true)
  → <StageStreamBar kind="outline" projectId={id} onDone={...} />
       useEffect:
         store.start('outline', id)
         await api.stage.outlineGenerate(id)  // resolves with {phase:'done', slides}
  → main STAGE_OUTLINE_GENERATE:
       runner = new GenerationRunner({...})
       activeRuns.set(id, {runner, kind:'outline', projectId:id})
       runner.run():
         onProgress → broadcast(STAGE_OUTLINE_STREAM, {kind:'outline', phase:'streaming', chars, projectId:id})
         onDone    → broadcast(..., {phase:'done', chars, html}) + activeRuns.delete(id)
         onError   → broadcast(..., {phase:'cancelled'|'error', error}) + activeRuns.delete(id)
       resolve IPC with {phase, slides, html, error}
  → renderer subscriber (App.tsx):
       if event.projectId === currentProjectId: store.set({phase, chars, html, error})
  → <StageStreamBar> re-renders
       phase='done'    → onDone(result) → store.reset() → unmounts (parent's mountBar=false)
       phase='cancelled' → message.info('已取消') + store.reset() + unmount
       phase='error'   → message.error(error.message) + store.reset() + unmount
```

## Error / Cancel

- **User cancel**: store.cancel() → api.stage.outlineCancel(projectId) → main looks up activeRuns.get(projectId) → runner.interrupt(). SDK throws → onError fires → broadcast phase='cancelled' → store updates → component shows toast + resets.
- **LLM error**: same path, but error.code !== 'CANCELLED' → phase='error'.
- **IPC call rejects unexpectedly** (e.g. main process crash): store.start's await throws → catch in StageStreamBar's useEffect, message.error + reset.
- **No timeout** in this spec. If the LLM hangs, the user must click cancel.

## Testing

### Unit (`tests/unit/`)

- `tests/unit/ipc-stage-stream.test.ts`: mock `GenerationRunner`, exercise the three handlers. Assert:
  - activeRuns registry adds on start, deletes on done/error.
  - Cancel handler calls `runner.interrupt()` and broadcasts phase='cancelled'.
  - onError does NOT re-throw (so IPC resolves normally).
  - Progress broadcast includes `chars` from `onProgress({current})`.
- `tests/unit/stores/stageStream.test.ts`: drive the store with fake `api` mocks. Assert:
  - start transitions idle → streaming.
  - External subscriber event for current project updates chars/phase.
  - cancel transitions streaming → cancelling; subsequent phase='cancelled' event → idle.
  - External event for unrelated projectId is ignored.

### E2E (`tests/e2e/`)

- New spec: `outline-stream-progress.spec.ts`. Clicks CollectEditor 下一步 → assert `<StageStreamBar/>` appears within 1s → assert character count > 0 after 5s → click 取消 → assert "已取消" toast + component unmount.
- Extend `stage-flow.spec.ts` (or add `slide-regen-stream.spec.ts`): trigger slide-regen, assert HTML preview panel appears with content, click cancel.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Multiple in-flight streams (e.g. user clicks regen twice) | Registry overwrites prior entry; old runner's broadcast ignored (its projectId/slideId no longer matches current). Old runner leaks for the duration of its LLM call. Acceptable for MVP. |
| SDK event `runId` collision | We key on `projectId` / `${projectId}:${slideId}` not on `runId`. Two simultaneous outline gens on the same project is not a use case. |
| `onError` swallowing the error | We resolve IPC with `{phase: 'error', error}` so callers awaiting get the same info. They can also subscribe to the broadcast for live updates. |
| Renderer's subscriber set up in App.tsx fires for all windows | Use `projectId` filter. (Single-window app today, but future-proof.) |

## Out of Scope (next)

- IPC handler timeout (90s).
- Live JSON parse of partial outline for slide-count preview.
- Runner `outline` field rename.
- Refactor `useGenerationStore` to share with Stage 3.

## Open Questions

None — all design decisions settled during brainstorming. Awaiting user review of this written spec.
