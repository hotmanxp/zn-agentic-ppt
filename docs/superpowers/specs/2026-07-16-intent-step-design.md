# Intent Step — Real LLM Call for "理解任务与受众"

**Date:** 2026-07-16
**Status:** Draft (awaiting user review)
**Author:** OpenCC session

## Context

The workbench's 5-step generation progress card (`GenerationCard` / `GenerationProgressPanel`) shows:

1. 理解任务与受众 — **MOCKED** (no IPC handler exists; advances purely on `progress >= 20%`)
2. 检索并校验企业知识 — **MOCKED** (no retrieval; `briefMarkdown` is passed as text only)
3. 搭建演示叙事 — **REAL** (`IPC.STAGE_OUTLINE_GENERATE` → `GenerationRunner` + `OUTLINE_PROMPT`)
4. 生成页面与讲述提示 — **REAL** (`IPC.STAGE_HTML_GENERATE` → `runOrchestrator`)
5. 检查引用与可对外范围 — **MOCKED** (no post-gen verification; advances on `progress >= 100%`)

Step 1 is the only "conceptually-mocked but easy to make real" step: a single LLM call that turns the user's brief into a structured intent summary that can be injected into the downstream `OUTLINE_PROMPT`. Steps 2 and 5 need RAG and citation infrastructure that doesn't exist; they remain mocked for this change.

## Goal

Make Step 1 a real LLM-driven phase that runs before outline generation:

1. A new IPC handler `STAGE_INTENT_GENERATE` runs `INTENTION_PROMPT` against the project brief.
2. The output is a structured `IntentSummary` JSON, validated by zod and persisted to `<projectDir>/intent.json`.
3. The `IntentSummary` is injected into `OUTLINE_PROMPT` so downstream generation has structured grounding.
4. The UI's Step 1 state is driven by the real IPC lifecycle (`pending | running | done | error | cancelled`), not arithmetic on slide progress.

## Non-Goals

- Making Step 2 (search/knowledge retrieval) or Step 5 (citation verification) real — separate work; requires RAG infrastructure.
- Backwards compatibility shims for projects with no `intent.json` — the handler throws fast; users on old projects must regenerate.
- Replacing the existing outline / HTML IPC contracts.
- Visual UI redesign of the generation card.
- Per-step cancel UI (cancel covers the whole intent phase only).
- A retry mechanism (fast-fail: user clicks "重新生成" to retry from scratch).

## Architecture

Three boundaries: prompt + schema, IPC + persistence, renderer state + UI.

### 1. Prompt + Schema (shared between main and renderer for typing)

#### New file: `src/main/sdk/prompts/intention.ts`

```ts
export const intentionPrompt: PromptSpec = {
  id: "INTENTION_PROMPT",
  title: "意图提炼",
  description: "从 brief 提炼受众画像、目标拆解、语调、约束、覆盖点，作为大纲生成的 grounding",
  defaultTemplate: `
你是 PPT 策划。请基于以下项目 brief 提炼一份结构化的「意图理解」，用于后续大纲与页面生成。

【项目 brief (markdown)】
{{briefMarkdown}}

输出严格 JSON(不要解释,直接输出):
{
  "audience": {
    "profile": "<一句话画像, ≤ 50 字>",
    "expertise": "<新手 | 熟手 | 专家>",
    "concerns": ["<关注点 1>", "<关注点 2>", ...]
  },
  "goal_decomposition": {
    "primary": "<主目标一句话>",
    "secondary": ["<次目标>", ...]
  },
  "tone": "<professional | technical | inspirational | casual>",
  "constraints": {
    "duration": "<如 '20 分钟'>",
    "pages": <number>,
    "language": "<zh-CN | en>"
  },
  "must_cover_points": ["<必讲点 1>", ...],
  "forbidden": ["<禁提点 1>", ...],
  "narrative_arc": "<如 '背景→痛点→方案→证据→行动'>"
}
`,
  variables: [{ name: "briefMarkdown", type: "string", description: "项目 brief markdown" }],
};
```

Register in `src/main/sdk/prompts/index.ts`:
```ts
import { intentionPrompt } from "./intention.js";
registerPrompt(intentionPrompt);
```

Add to `PromptId` union in `src/main/sdk/prompts/types.ts`:
```ts
export type PromptId = ... | "INTENTION_PROMPT";
```

#### New file: `src/shared/intent.ts`

```ts
import { z } from "zod";

export const intentSchema = z.object({
  audience: z.object({
    profile: z.string().min(1).max(200),
    expertise: z.enum(["新手", "熟手", "专家"]),
    concerns: z.array(z.string()),
  }),
  goal_decomposition: z.object({
    primary: z.string().min(1),
    secondary: z.array(z.string()),
  }),
  tone: z.enum(["professional", "technical", "inspirational", "casual"]),
  constraints: z.object({
    duration: z.string().min(1),
    pages: z.number().int().positive(),
    language: z.enum(["zh-CN", "en"]),
  }),
  must_cover_points: z.array(z.string()),
  forbidden: z.array(z.string()),
  narrative_arc: z.string(),
});

export type IntentSummary = z.infer<typeof intentSchema>;
```

### 2. OUTLINE_PROMPT Injection

#### `src/main/sdk/prompts/outline.ts` — modify

- `defaultTemplate`: append at end (before closing backtick) a new section:
  ```
  【意图理解 (structured grounding — 使用其提炼出的约束、角度、覆盖点；不要重复 brief 已陈述的事实)】
  {{intentJson}}
  ```
- `variables`: append `{ name: "intentJson", type: "json", description: "IntentSummary 对象" }`.

### 3. Persistence

#### New file: `src/main/fs/intent.ts`

Mirrors `src/main/fs/outline.ts` patterns:

```ts
import { getProjectDir } from "./paths.js";
import type { IntentSummary } from "../../shared/intent.js";

export async function readIntent(projectId: string): Promise<IntentSummary | null> {
  const path = `${getProjectDir(projectId)}/intent.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const text = await file.text();
  return JSON.parse(text) as IntentSummary;
}

export async function writeIntent(projectId: string, intent: IntentSummary): Promise<void> {
  const path = `${getProjectDir(projectId)}/intent.json`;
  await Bun.write(path, JSON.stringify(intent, null, 2));
}

export async function intentExists(projectId: string): Promise<boolean> {
  const file = Bun.file(`${getProjectDir(projectId)}/intent.json`);
  return file.exists();
}
```

### 4. IPC Channel + Types

#### `src/shared/ipc-channels.ts` — modify

Add two invoke channels in the "Stage 1-4" section:
```ts
STAGE_INTENT_GENERATE: "stage:intent-generate",
STAGE_INTENT_CANCEL: "stage:intent-cancel",
```

Add one push channel in the second "Main → renderer (push)" section (alongside `STAGE_OUTLINE_STREAM`):
```ts
STAGE_INTENT_STREAM: "stage:intent-stream",
```

#### `src/shared/ipc-types.ts` — modify

```ts
export interface IntentGenerateRequest { id: string; }
export interface IntentGenerateResponse {
  phase: "done" | "error" | "cancelled";
  intent?: IntentSummary;
  error?: { code: string; message: string };
}
export interface IntentStreamPayload {
  runId: string;
  projectId: string;
  phase: "streaming" | "done" | "error" | "cancelled";
  chars?: number;
  intent?: IntentSummary;
  error?: { code: string; message: string };
}
```

### 5. IPC Handler

#### `src/main/ipc/stage.ts` — modify

Add new handler mirroring `STAGE_OUTLINE_GENERATE` structure:

```ts
ipcMain.handle(
  IPC.STAGE_INTENT_GENERATE,
  async (_, { id }: IntentGenerateRequest): Promise<IntentGenerateResponse> => {
    const project = await projectFs.getProject(id);
    if (!project) throw new Error("project not found");
    const brief = project.brief;
    if (!brief?.markdown) {
      throw new Error("请先在第一阶段填写项目信息（主题/听众/目标/时长/页数）");
    }
    const settings = await settingsFs.getSettings();
    const cwd = getProjectDir(id);
    const key = `intent:${id}`;
    let buffer = "";

    const runner = new GenerationRunner({
      cwd,
      topic: project.topic,
      outline: brief.markdown,
      settings,
      runId: id,
      systemPrompt: await renderPrompt("INTENTION_PROMPT", { briefMarkdown: brief.markdown }),
      userMessage: "请基于以上 brief 提炼结构化意图。",
      onEvent: () => {},
      onProgress: (info) =>
        broadcast(IPC.STAGE_INTENT_STREAM, {
          runId: key, projectId: id, phase: "streaming", chars: info.current,
        }),
      onDone: ({ html, durationMs }) => {
        buffer = html;
        broadcast(IPC.STAGE_INTENT_STREAM, {
          runId: key, projectId: id, phase: "done", chars: html.length, durationMs,
        });
        registry.unregister(key);
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? "cancelled" : "error";
        broadcast(IPC.STAGE_INTENT_STREAM, { runId: key, projectId: id, phase, error });
        registry.unregister(key);
        if (phase === "error") throw new Error(error.message);
      },
    });
    registry.register(key, runner, "intent");
    await runner.run();

    if (registry.isCancelled(key)) return { phase: "cancelled" };

    let parsed: unknown;
    try {
      parsed = extractFirstJsonValue(buffer);
    } catch (e: any) {
      console.log(`[intent:${id}] JSON extraction failed: ${e?.message ?? e}`);
      console.log(`[intent:${id}] LLM buffer (first 800 chars): ${buffer.slice(0, 800)}`);
      throw new Error("LLM 未返回有效 JSON");
    }
    let intent: IntentSummary;
    try {
      intent = intentSchema.parse(parsed);
    } catch (e: any) {
      console.log(`[intent:${id}] schema validation failed: ${e?.message ?? e}`);
      throw new Error(`意图提炼结果不符合 schema: ${e?.message ?? e}`);
    }
    await writeIntent(id, intent);
    return { phase: "done", intent };
  },
);

ipcMain.handle(IPC.STAGE_INTENT_CANCEL, async (_, { id }: { id: string }) => {
  registry.cancel(`intent:${id}`);
  return { ok: true };
});
```

Modify `STAGE_OUTLINE_GENERATE` (same file) to inject `intentJson`:
```ts
const rawIntent = await readIntent(id);
if (!rawIntent) throw new Error("意图未生成，请先重试生成（intent 未持久化）");
const intent = intentSchema.parse(rawIntent);  // re-validate on disk read; defends against schema drift
systemPrompt: await renderPrompt("OUTLINE_PROMPT", {
  briefMarkdown: brief.markdown,
  intentJson: intent,
}),
```

### 6. Renderer API Bridge

#### `src/renderer/lib/api.ts` — modify

Add to `StageApi`:
```ts
intentGenerate: (id: string) => ipcRenderer.invoke(IPC.STAGE_INTENT_GENERATE, { id }),
intentCancel: (id: string) => ipcRenderer.invoke(IPC.STAGE_INTENT_CANCEL, { id }),
onIntentStream: (cb: (e: IntentStreamPayload) => void) => {
  const listener = (_e: unknown, payload: IntentStreamPayload) => cb(payload);
  ipcRenderer.on(IPC.STAGE_INTENT_STREAM, listener);
  return () => ipcRenderer.removeListener(IPC.STAGE_INTENT_STREAM, listener);
},
```

### 7. Renderer Store (new)

#### New file: `src/renderer/stores/intentGeneration.ts`

```ts
import { create } from "zustand";
import { api } from "../lib/api.js";
import type { IntentStreamPayload, IntentSummary } from "../lib/api.js";

type IntentPhase = "idle" | "running" | "done" | "cancelled" | "error";

interface IntentState {
  projectId: string | null;
  phase: IntentPhase;
  intent: IntentSummary | null;
  chars: number;
  lastError: string | null;
  run: (projectId: string) => Promise<IntentSummary>;
  cancel: () => Promise<void>;
  applyEvent: (e: IntentStreamPayload) => void;
  reset: () => void;
}

export const useIntentGenerationStore = create<IntentState>((set, get) => ({
  projectId: null, phase: "idle", intent: null, chars: 0, lastError: null,

  run: async (projectId) => {
    set({ projectId, phase: "running", intent: null, chars: 0, lastError: null });
    try {
      const r = await api.stage.intentGenerate(projectId);
      if (r.phase === "done" && r.intent) {
        set({ phase: "done", intent: r.intent, chars: JSON.stringify(r.intent).length });
        return r.intent;
      }
      if (r.phase === "cancelled") {
        set({ phase: "cancelled" });
        throw new Error("cancelled");
      }
      const msg = r.error?.message ?? "意图提炼失败";
      set({ phase: "error", lastError: msg });
      throw new Error(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (get().phase !== "error") set({ phase: "error", lastError: msg });
      throw e;
    }
  },

  cancel: async () => {
    const { projectId } = get();
    if (!projectId) return;
    await api.stage.intentCancel(projectId);
  },

  applyEvent: (e) => {
    if (get().projectId !== e.projectId) return;
    if (e.phase === "streaming") set({ chars: e.chars ?? get().chars });
    else if (e.phase === "done") set({ chars: e.chars ?? get().chars });
    else if (e.phase === "cancelled") set({ phase: "cancelled" });
    else if (e.phase === "error") set({ phase: "error", lastError: e.error?.message ?? "unknown" });
  },

  reset: () => set({ projectId: null, phase: "idle", intent: null, chars: 0, lastError: null }),
}));
```

The `start()` chain in `pptGeneration.start()` (existing) is **not** modified. Instead, the orchestration chain lives inside `approveOutline` in `src/renderer/stores/workbench.ts:306-330` — replace the existing `void usePptGenerationStore.getState().start(id)` line with:

```ts
async function runFullGeneration(projectId: string) {
  useIntentGenerationStore.getState().reset();
  await useIntentGenerationStore.getState().run(projectId);  // throws on fail → fast-fail
  await useStageStreamStore.getState().start("outline", projectId);
  await usePptGenerationStore.getState().start(projectId);
}
```

The existing `pptGen.reset()` + `initialize()` + chat appends in `approveOutline` stay untouched. The retry button in `GenerationProgressPanel.tsx:60` (which calls `approveOutline`) gets the new chain for free.

### 8. UI: Step State Wiring

#### `src/renderer/workbench/GenerationThinkingPanel.tsx` — modify

Add optional `stepStates?: Record<string, "pending" | "running" | "done" | "error">` prop. When provided, override the arithmetic:

```tsx
const done = stepStates?.[item.id] === "done" || progress >= (index + 1) * 20;
const active = stepStates?.[item.id] === "running" || (!done && index === activeIndex);
```

The default behavior (no `stepStates`) is unchanged — backward compatible with any callers that don't pass it.

#### `src/renderer/workbench/GenerationCard.tsx` and `GenerationProgressPanel.tsx` — modify

Compute and pass `stepStates`:
```ts
const intentPhase = useIntentGenerationStore((s) => s.phase);
const outlinePhase = useStageStreamStore((s) => s.phase);
const htmlPhase = usePptGenerationStore((s) => s.phase);

const stepStates: Record<string, "pending" | "running" | "done" | "error"> = {
  intent: intentPhase === "done" ? "done"
        : intentPhase === "running" ? "running"
        : intentPhase === "error" ? "error"
        : intentPhase === "cancelled" ? "pending"  // treat cancelled as not-done
        : "pending",
  search: "pending",        // still mocked
  outline: outlinePhase === "streaming" ? "running"
         : outlinePhase === "done" ? "done"
         : outlinePhase === "error" ? "error"
         : "pending",
  compose: htmlPhase === "running" ? "running"
         : htmlPhase === "done" ? "done"
         : htmlPhase === "error" ? "error"
         : "pending",
  verify: "pending",        // still mocked
};
```

Topline error message in `GenerationProgressPanel` when `intentPhase === "error"`:
```tsx
{isError ? "生成失败：意图提炼失败，请重试" : ...}
```

### 9. IPC Event Subscription

Mirror the existing `useStageStreamSubscription` hook (`src/renderer/hooks/useStageStreamSubscription.ts`) — mount a new `useIntentStreamSubscription` at the app root that forwards `STAGE_INTENT_STREAM` events to `useIntentGenerationStore.applyEvent`. Add a single line inside the existing hook to keep all stage stream subscriptions co-located:

```ts
export function useStageStreamSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onOutlineStream((e) => useStageStreamStore.getState().applyEvent(e));
    const u2 = api.stage.onSlideRegenStream((e) => useStageStreamStore.getState().applyEvent(e));
    const u3 = api.stage.onIntentStream((e) => useIntentGenerationStore.getState().applyEvent(e));
    return () => { u1(); u2(); u3(); };
  }, []);
}
```

The store's `applyEvent` filters by `projectId` so cross-project events are no-ops, same as the existing pattern.

## Data Flow

```
[User clicks "下一步" in CollectEditor]
      ↓
approveOutline(projectId) in workbench.ts
      ↓ runFullGeneration()
useIntentGenerationStore.run(projectId)
      ↓ api.stage.intentGenerate(id)
main: STAGE_INTENT_GENERATE handler
      ↓ GenerationRunner + INTENTION_PROMPT
      ↓ extractFirstJsonValue(buffer)
      ↓ intentSchema.parse(parsed)
      ↓ writeIntent(id, intent)
      ↓ broadcast STAGE_INTENT_STREAM { phase: "done", chars }
      ↓ return { phase: "done", intent }
renderer: store updates { phase: "done", intent }
      ↓
useStageStreamStore.start("outline", projectId)
      ↓ api.stage.outlineGenerate(id)
main: STAGE_OUTLINE_GENERATE
      ↓ readIntent(id) → IntentSummary
      ↓ renderPrompt("OUTLINE_PROMPT", { briefMarkdown, intentJson })
      ↓ GenerationRunner (existing)
      ↓ writeOutline + return
      ↓
usePptGenerationStore.start(projectId)
      ↓ api.stage.htmlGenerate(id) (existing)
      ↓ runOrchestrator (existing)
```

## Error Handling

| Failure | Result | UI |
|---|---|---|
| Intent LLM throws (network, timeout) | `intentPhase = error` + raw error msg | toast "意图提炼失败: <msg>" + 重新生成按钮 |
| Intent JSON parse fails | `intentPhase = error` + "LLM 未返回有效 JSON" | same as above |
| Intent zod schema validation fails | `intentPhase = error` + field-level error | same; logged to console with full buffer |
| Intent cancelled by user | `intentPhase = cancelled` | greyed toast; no auto-retry |
| Outline fails after intent done | `intentPhase = done` (preserved) + `outlinePhase = error` | existing outline error UI |
| HTML fails after outline done | all three phases preserved except `compose = error` | existing HTML error UI |
| User retries after error | `intentStore.reset()` → re-run intent | clean retry, no stale state |

Fast-fail policy: any intent failure aborts the whole generation. No silent fallback to outline-without-intent (would degrade downstream quality and mask the real issue).

## Backwards Compatibility

Projects created before this change have no `intent.json`. When `approveOutline` is called on such a project:
- `intentStore.run()` will create `intent.json` on success
- If brief is missing entirely, intent handler throws "请先在第一阶段填写项目信息" — same message as outline, no regression
- No migration script needed

## Testing

### Unit tests

#### `src/main/sdk/prompts/intention.test.ts` (new)
- `intentSchema.parse()` accepts complete valid JSON
- Missing `audience` → throws
- `tone: "foo"` → throws
- `constraints.pages = -1` → throws
- `expertise: "中等"` → throws
- Empty arrays allowed

#### `src/main/fs/intent.test.ts` (new)
- Round-trip: writeIntent then readIntent returns identical object
- `readIntent` on missing file returns null (not throw)
- Bun.file write/read parity

#### `src/main/ipc/stage.intent.test.ts` (new)
- Missing project → throws "project not found"
- Missing brief → throws "请先在第一阶段填写项目信息"
- Runner returns malformed JSON → handler throws "LLM 未返回有效 JSON"; `intent.json` not written
- Runner returns valid JSON but zod fails → handler throws schema error; `intent.json` not written
- Happy path → mock runner, verify intent.json written + return value

### Regression

- `bun run typecheck` must pass for both `main` and `renderer` tsconfigs
- `bun run test` (vitest) — full suite must pass; expect new tests bring total from 101 to ~110
- Manual smoke: open an existing project with no `intent.json`, click 重新生成, observe:
  1. Step 1 spinner appears with "理解任务与受众" label
  2. After ~3-10s, Step 1 turns green checkmark
  3. Step 3 (outline) spinner appears
  4. After outline done, Step 4 (HTML) runs as before
  5. `<projectDir>/intent.json` exists with valid schema
  6. Reload project, re-trigger generation: intent runs again (no caching of stale intent)

## File Inventory

| File | Action | LOC est. |
|---|---|---|
| `src/main/sdk/prompts/intention.ts` | new | ~40 |
| `src/main/sdk/prompts/index.ts` | modify | +2 |
| `src/main/sdk/prompts/types.ts` | modify | +1 |
| `src/main/sdk/prompts/outline.ts` | modify | +6 |
| `src/main/fs/intent.ts` | new | ~25 |
| `src/main/ipc/stage.ts` | modify | +90 |
| `src/shared/ipc-channels.ts` | modify | +3 |
| `src/shared/ipc-types.ts` | modify | +20 |
| `src/shared/intent.ts` | new | ~30 |
| `src/renderer/lib/api.ts` | modify | +15 |
| `src/renderer/stores/intentGeneration.ts` | new | ~80 |
| `src/renderer/workbench/GenerationThinkingPanel.tsx` | modify | +8 |
| `src/renderer/workbench/GenerationCard.tsx` | modify | +12 |
| `src/renderer/workbench/GenerationProgressPanel.tsx` | modify | +18 |
| `src/renderer/workbench/Workbench.tsx` (or call site) | modify | +15 |
| `src/renderer/hooks/useStageStreamSubscription.ts` | modify | +2 |
| `src/main/sdk/prompts/intention.test.ts` | new | ~60 |
| `src/main/fs/intent.test.ts` | new | ~40 |
| `src/main/ipc/stage.intent.test.ts` | new | ~80 |

Total: ~17 files, ~545 LOC increment.

## Open Questions

None — design is settled after the three-question brainstorming round (timing = pre-outline; output = structured JSON; visibility = hidden/fast-fail; cancel = per-phase).