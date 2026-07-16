# Intent Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workbench's Step 1 ("理解任务与受众") a real LLM call. Before outline generation, run `INTENTION_PROMPT` against the project brief to produce a structured `IntentSummary` JSON, persist it to `<projectDir>/intent.json`, and inject it into `OUTLINE_PROMPT`. Drive the Step 1 UI state from the real IPC lifecycle, not arithmetic on slide progress.

**Architecture:** New IPC handler `STAGE_INTENT_GENERATE` mirroring the existing `STAGE_OUTLINE_GENERATE` structure. New zustand store on the renderer side. The 5-step progress card's `stepStates` prop gets a new code path that reads from three stores (intent / outline stream / html gen). Fast-fail on any intent error.

**Tech Stack:** TypeScript · Bun · Electron · React · Zustand · Zod

**Spec:** [`docs/superpowers/specs/2026-07-16-intent-step-design.md`](../specs/2026-07-16-intent-step-design.md)

## Global Constraints

From `AGENTS.md`:
- `const` > `let`; early returns
- Single-word naming preferred; avoid unnecessary destructuring
- Use `Bun.file()` / `Bun.write()` for filesystem ops
- Main process changes: keep file count ≤ 3 per change set; `bun run typecheck` + `bun run test` after
- Main process changes require `bun run build:main` + full Electron restart (Cmd+Q then `bun run dev`)
- Renderer changes auto HMR — no rebuild needed

From spec (`2026-07-16-intent-step-design.md`):
- `IntentSummary` zod schema enums are tight (`expertise`, `tone`, `language`)
- Fast-fail: any intent error aborts the whole generation (no silent fallback to no-intent outline)
- `intent.json` only written after zod parse passes
- `intentSchema.parse(readIntent(id))` re-validates on every outline read (defends against schema drift)
- IPC handler mirrors `STAGE_OUTLINE_GENERATE` pattern: registry key prefix `intent:<id>`; kind `"intent"` (widens existing `StreamKind` union)

## File Structure

**New files (5):**
- `src/shared/intent.ts` — zod schema + `IntentSummary` type
- `src/main/sdk/prompts/intention.ts` — `INTENTION_PROMPT` spec
- `src/main/fs/intent.ts` — `readIntent` / `writeIntent` / `intentExists`
- `src/renderer/stores/intentGeneration.ts` — zustand store
- Tests: `tests/unit/main/fs/intent.test.ts`, `tests/unit/main/sdk/prompts/intention.test.ts`, `tests/unit/main/ipc/stage.intent.test.ts`

**Modified files (12):**
- `src/shared/ipc-channels.ts` — 2 invoke + 1 push channel
- `src/shared/ipc-types.ts` — `IntentGenerateRequest` / `IntentGenerateResponse` / `IntentStreamPayload`
- `src/main/sdk/prompts/types.ts` — widen `PromptId` union
- `src/main/sdk/prompts/index.ts` — register `intentionPrompt`
- `src/main/sdk/prompts/outline.ts` — append `{{intentJson}}` section + variable
- `src/main/ipc/stage-stream-registry.ts` — widen `StreamKind` to include `"intent"`
- `src/main/ipc/stage.ts` — extract `generateIntent(id)` function; new IPC handler; cancel handler; modify outline handler
- `src/renderer/lib/api.ts` — 3 bridge methods
- `src/renderer/hooks/useStageStreamSubscription.ts` — subscribe to `STAGE_INTENT_STREAM`
- `src/renderer/stores/workbench.ts` — `approveOutline` chain: intent → outline → html
- `src/renderer/workbench/GenerationThinkingPanel.tsx` — add `stepStates` prop
- `src/renderer/workbench/GenerationCard.tsx` + `GenerationProgressPanel.tsx` — compute `stepStates`, intent error topline

---

## Task 1: Shared schema + FS persistence

**Files:**
- Create: `src/shared/intent.ts`
- Create: `src/main/fs/intent.ts`
- Test: `tests/unit/main/fs/intent.test.ts`

**Interfaces:**
- Consumes: `getProjectDir` from `src/main/fs/paths.js`
- Produces:
  - `IntentSummary` type (used by Tasks 2, 4, 5, 6, 7)
  - `intentSchema` zod schema (used by Tasks 2, 4, 5)
  - `readIntent(id) → IntentSummary | null`, `writeIntent(id, intent)`, `intentExists(id) → boolean`

- [ ] **Step 1: Write failing test for FS round-trip**

Create `tests/unit/main/fs/intent.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntentSummary } from "../../../src/shared/intent.js";

let workDir: string;
let prevDataDir: string | undefined;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "intent-test-"));
  prevDataDir = process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = workDir;
  vi.resetModules();
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  else process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = prevDataDir;
  vi.restoreAllMocks();
});

describe("intent fs", () => {
  const sample: IntentSummary = {
    audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
    goal_decomposition: { primary: "Convince", secondary: ["Educate"] },
    tone: "professional",
    constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
    must_cover_points: ["value"],
    forbidden: ["competitor names"],
    narrative_arc: "背景→痛点→方案",
  };

  test("writeIntent then readIntent round-trips", async () => {
    const { writeIntent, readIntent } = await import("../../../src/main/fs/intent.js");
    await writeIntent("proj-1", sample);
    const got = await readIntent("proj-1");
    expect(got).toEqual(sample);
  });

  test("readIntent returns null when file missing", async () => {
    const { readIntent } = await import("../../../src/main/fs/intent.js");
    expect(await readIntent("missing")).toBeNull();
  });

  test("intentExists reflects presence", async () => {
    const { writeIntent, intentExists } = await import("../../../src/main/fs/intent.js");
    expect(await intentExists("proj-2")).toBe(false);
    await writeIntent("proj-2", sample);
    expect(await intentExists("proj-2")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/main/fs/intent.test.ts`
Expected: FAIL with module-not-found for the `intent.js` module (file doesn't exist yet).

- [ ] **Step 3: Implement zod schema**

Create `src/shared/intent.ts`:

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

- [ ] **Step 4: Implement FS module**

Create `src/main/fs/intent.ts`:

```ts
import { getProjectDir } from "./paths.js";
import type { IntentSummary } from "../../shared/intent.js";

export async function readIntent(projectId: string): Promise<IntentSummary | null> {
  const path = `${getProjectDir(projectId)}/intent.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return (await file.json()) as IntentSummary;
}

export async function writeIntent(projectId: string, intent: IntentSummary): Promise<void> {
  const path = `${getProjectDir(projectId)}/intent.json`;
  await Bun.write(path, JSON.stringify(intent, null, 2));
}

export async function intentExists(projectId: string): Promise<boolean> {
  return Bun.file(`${getProjectDir(projectId)}/intent.json`).exists();
}
```

- [ ] **Step 5: Check `getProjectDir` honors test data dir**

Read `src/main/fs/paths.ts` and verify `getProjectDir` resolves from `process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR` when set. If it doesn't, add a fallback branch at the top of `getProjectDir`:

```ts
if (process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR) {
  return join(process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR, "projects", projectId);
}
```

(Modify `paths.ts` if needed; commit separately as `test: allow getProjectDir to read test data dir`).

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test tests/unit/main/fs/intent.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/intent.ts src/main/fs/intent.ts tests/unit/main/fs/intent.test.ts
git commit -m "feat(intent): add IntentSummary schema + FS persistence"
```

---

## Task 2: INTENTION_PROMPT + registration

**Files:**
- Create: `src/main/sdk/prompts/intention.ts`
- Modify: `src/main/sdk/prompts/types.ts` (add PromptId variant)
- Modify: `src/main/sdk/prompts/index.ts` (register)
- Test: `tests/unit/main/sdk/prompts/intention.test.ts`

**Interfaces:**
- Consumes: `IntentSummary` type from Task 1
- Produces:
  - `intentionPrompt: PromptSpec` with `id: "INTENTION_PROMPT"`, var `briefMarkdown`
  - Schema-parsed sample test proving intent fits zod

- [ ] **Step 1: Write failing test for prompt schema acceptance**

Create `tests/unit/main/sdk/prompts/intention.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { intentSchema } from "../../../../src/shared/intent.js";

describe("INTENTION_PROMPT example output", () => {
  test("sample matches schema", () => {
    const sample = {
      audience: { profile: "区域银行负责人", expertise: "熟手", concerns: ["ROI", "合规"] },
      goal_decomposition: { primary: "推进试点合作", secondary: ["建立信任"] },
      tone: "professional",
      constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
      must_cover_points: ["价值主张", "落地路径"],
      forbidden: ["竞品对比"],
      narrative_arc: "背景→痛点→方案→证据→行动",
    };
    expect(() => intentSchema.parse(sample)).not.toThrow();
  });

  test("invalid tone rejected", () => {
    const bad = {
      audience: { profile: "x", expertise: "新手", concerns: [] },
      goal_decomposition: { primary: "x", secondary: [] },
      tone: "aggressive",
      constraints: { duration: "10 min", pages: 5, language: "zh-CN" },
      must_cover_points: [],
      forbidden: [],
      narrative_arc: "x",
    };
    expect(() => intentSchema.parse(bad)).toThrow();
  });

  test("negative pages rejected", () => {
    const bad = {
      audience: { profile: "x", expertise: "新手", concerns: [] },
      goal_decomposition: { primary: "x", secondary: [] },
      tone: "professional",
      constraints: { duration: "10 min", pages: -1, language: "zh-CN" },
      must_cover_points: [],
      forbidden: [],
      narrative_arc: "x",
    };
    expect(() => intentSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/main/sdk/prompts/intention.test.ts`
Expected: FAIL with module-not-found for `intentSchema` (file doesn't exist yet — Task 1 must be complete first; or skip if running in order).

- [ ] **Step 3: Implement INTENTION_PROMPT**

Create `src/main/sdk/prompts/intention.ts`:

```ts
import type { PromptSpec } from "./types.js";

export const intentionPrompt: PromptSpec = {
  id: "INTENTION_PROMPT",
  title: "意图提炼",
  description: "从 brief 提炼受众画像、目标拆解、语调、约束、覆盖点，作为大纲生成的 grounding",
  defaultTemplate: `你是 PPT 策划。请基于以下项目 brief 提炼一份结构化的「意图理解」，用于后续大纲与页面生成。

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
  variables: [
    {
      name: "briefMarkdown",
      type: "string",
      description: "项目 brief markdown",
    },
  ],
};
```

- [ ] **Step 4: Add to PromptId union**

Modify `src/main/sdk/prompts/types.ts`:

```ts
export type PromptId =
  | "OUTLINE_PROMPT"
  | "REGENERATE_PROMPT"
  | "SLIDE_SYSTEM_PROMPT"
  | "SLIDE_USER_PROMPT"
  | "INTENTION_PROMPT";
```

- [ ] **Step 5: Register in prompts index**

Modify `src/main/sdk/prompts/index.ts` — add at the end alongside other registrations:

```ts
import { intentionPrompt } from "./intention.js";
registerPrompt(intentionPrompt);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test tests/unit/main/sdk/prompts/intention.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/sdk/prompts/intention.ts tests/unit/main/sdk/prompts/intention.test.ts src/main/sdk/prompts/types.ts src/main/sdk/prompts/index.ts
git commit -m "feat(intent): add INTENTION_PROMPT and registration"
```

---

## Task 3: IPC channels + types

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-types.ts`

**Interfaces:**
- Produces:
  - `IPC.STAGE_INTENT_GENERATE` / `IPC.STAGE_INTENT_CANCEL` (invoke)
  - `IPC.STAGE_INTENT_STREAM` (push)
  - `IntentGenerateRequest` / `IntentGenerateResponse` / `IntentStreamPayload` types

- [ ] **Step 1: Add IPC channels**

Modify `src/shared/ipc-channels.ts` — in the "Stage 1-4" section (around line 32), add:

```ts
STAGE_INTENT_GENERATE: "stage:intent-generate",
STAGE_INTENT_CANCEL: "stage:intent-cancel",
```

In the second "Main → renderer (push)" section (around line 50, alongside `STAGE_OUTLINE_STREAM`):

```ts
STAGE_INTENT_STREAM: "stage:intent-stream",
```

- [ ] **Step 2: Add IPC types**

Modify `src/shared/ipc-types.ts` — append at the end (after `HtmlGenerateResponse`):

```ts
export interface IntentGenerateRequest {
  id: string;
}

export interface IntentGenerateResponse {
  phase: "done" | "error" | "cancelled";
  intent?: import("./intent.js").IntentSummary;
  error?: { code: string; message: string };
}

export interface IntentStreamPayload {
  runId: string;
  projectId: string;
  phase: "streaming" | "done" | "error" | "cancelled";
  chars?: number;
  durationMs?: number;
  intent?: import("./intent.js").IntentSummary;
  error?: { code: string; message: string };
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (both main and renderer tsconfigs). No new symbols referenced yet, so no consumers should break.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/ipc-types.ts
git commit -m "feat(intent): add IPC channels and payload types"
```

---

## Task 4: STAGE_INTENT_GENERATE handler + cancel handler + OUTLINE_PROMPT injection

**Files:**
- Modify: `src/main/ipc/stage-stream-registry.ts` (widen `StreamKind`)
- Modify: `src/main/ipc/stage.ts` (new handler, cancel handler, modify outline handler)
- Modify: `src/main/sdk/prompts/outline.ts` (inject `intentJson`)
- Test: `tests/unit/main/ipc/stage.intent.test.ts`

**Interfaces:**
- Consumes: `IntentSummary`, `intentSchema` (Task 1), `INTENTION_PROMPT` (Task 2), IPC channels (Task 3)
- Produces:
  - `StreamKind` widened to include `"intent"`
  - Extracted `generateIntent(id)` function (testable without electron)
  - `ipcMain.handle(IPC.STAGE_INTENT_GENERATE, ...)`
  - `ipcMain.handle(IPC.STAGE_INTENT_CANCEL, ...)`
  - `STAGE_OUTLINE_GENERATE` reads + parses + injects `intentJson`
  - `OUTLINE_PROMPT` template gains `{{intentJson}}` section + variable

- [ ] **Step 1: Widen StreamKind**

Modify `src/main/ipc/stage-stream-registry.ts`:

```ts
export type StreamKind = "outline" | "slide-regen" | "intent";
```

- [ ] **Step 2: Modify OUTLINE_PROMPT**

Modify `src/main/sdk/prompts/outline.ts`:
- Append to `defaultTemplate` (right before the closing backtick):

```

【意图理解 (structured grounding — 使用其提炼出的约束、角度、覆盖点；不要重复 brief 已陈述的事实)】
{{intentJson}}
```

- Append to `variables`:

```ts
{
  name: "intentJson",
  type: "json",
  description: "IntentSummary 对象",
},
```

- [ ] **Step 3: Write failing test for generateIntent**

Create `tests/unit/main/ipc/stage.intent.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workDir: string;
let prevDataDir: string | undefined;
let mockRunResult: { html: string; durationMs: number };

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "stage-intent-test-"));
  prevDataDir = process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = workDir;
  mockRunResult = { html: "", durationMs: 0 };
  vi.resetModules();
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  else process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = prevDataDir;
  vi.restoreAllMocks();
});

const validIntentJson = JSON.stringify({
  audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
  goal_decomposition: { primary: "Convince", secondary: [] },
  tone: "professional",
  constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
  must_cover_points: ["value"],
  forbidden: [],
  narrative_arc: "A→B",
});

async function loadStageWithMockRunner() {
  vi.doMock("../../../../src/main/sdk/runner.js", () => ({
    GenerationRunner: class {
      constructor(public opts: any) {}
      async run() {
        mockRunResult.html = this.opts.systemPrompt.includes("INTENTION_PROMPT")
          ? validIntentJson
          : "{}";
        mockRunResult.durationMs = 1;
        this.opts.onDone?.(mockRunResult);
      }
      interrupt() {}
    },
  }));
  vi.doMock("../../../../src/main/fs/projects.js", () => ({
    getProject: async () => ({ id: "p1", topic: "t", brief: { markdown: "# brief" } }),
  }));
  vi.doMock("../../../../src/main/fs/settings.js", () => ({ getSettings: async () => ({}) }));
  vi.doMock("../../../../src/main/ipc/stage-stream-registry.js", () => ({
    registry: {
      register: () => {},
      unregister: () => {},
      isCancelled: () => false,
    },
  }));
}

describe("generateIntent (via stage.ts)", () => {
  test("writes intent.json on success", async () => {
    await loadStageWithMockRunner();
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    const result = await generateIntent("p1");
    expect(result.phase).toBe("done");
    expect(result.intent?.constraints.pages).toBe(10);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    const disk = await readIntent("p1");
    expect(disk?.tone).toBe("professional");
  });

  test("throws and writes nothing on invalid JSON", async () => {
    await loadStageWithMockRunner();
    mockRunResult.html = "not json";
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/JSON/);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    expect(await readIntent("p1")).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun run test tests/unit/main/ipc/stage.intent.test.ts`
Expected: FAIL with module-not-found for `generateIntent` export from `stage.ts`.

- [ ] **Step 5: Extract generateIntent function**

Modify `src/main/ipc/stage.ts`. Add imports at top:

```ts
import { readIntent, writeIntent } from "../fs/intent.js";
import { intentSchema } from "../../shared/intent.js";
import type { IntentGenerateRequest, IntentGenerateResponse } from "../../shared/ipc-types.js";
```

Add the extracted function near the top of the file (before `registerStageIPC`):

```ts
export async function generateIntent(id: string): Promise<IntentGenerateResponse> {
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
  let intent;
  try {
    intent = intentSchema.parse(parsed);
  } catch (e: any) {
    console.log(`[intent:${id}] schema validation failed: ${e?.message ?? e}`);
    throw new Error(`意图提炼结果不符合 schema: ${e?.message ?? e}`);
  }
  await writeIntent(id, intent);
  return { phase: "done", intent };
}
```

- [ ] **Step 6: Add IPC handlers inside `registerStageIPC()`**

In `src/main/ipc/stage.ts`, inside `registerStageIPC()`, add (alongside existing `STAGE_OUTLINE_GENERATE` handler):

```ts
ipcMain.handle(IPC.STAGE_INTENT_GENERATE, async (_, { id }: IntentGenerateRequest) => {
  return generateIntent(id);
});

ipcMain.handle(IPC.STAGE_INTENT_CANCEL, async (_, { id }: { id: string }) => {
  registry.cancel(`intent:${id}`);
  return { ok: true };
});
```

- [ ] **Step 7: Modify STAGE_OUTLINE_GENERATE to inject intent**

In the same `STAGE_OUTLINE_GENERATE` handler (around line 88 in current `stage.ts`), replace:

```ts
systemPrompt: await renderPrompt("OUTLINE_PROMPT", {
  briefMarkdown: brief.markdown,
}),
```

with:

```ts
const rawIntent = await readIntent(id);
if (!rawIntent) throw new Error("意图未生成，请先重试生成（intent 未持久化）");
const intent = intentSchema.parse(rawIntent);
systemPrompt: await renderPrompt("OUTLINE_PROMPT", {
  briefMarkdown: brief.markdown,
  intentJson: intent,
}),
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bun run test tests/unit/main/ipc/stage.intent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Run full typecheck + full test suite**

Run: `bun run typecheck && bun run test`
Expected: PASS — full suite green (existing 101 tests still passing; 2 new from this task).

- [ ] **Step 10: Commit**

```bash
git add src/main/ipc/stage-stream-registry.ts src/main/ipc/stage.ts tests/unit/main/ipc/stage.intent.test.ts src/main/sdk/prompts/outline.ts
git commit -m "feat(intent): add IPC handlers and inject intent into outline prompt"
```

---

## Task 5: Renderer API bridge + intent store + stream subscription

**Files:**
- Modify: `src/renderer/lib/api.ts`
- Create: `src/renderer/stores/intentGeneration.ts`
- Modify: `src/renderer/hooks/useStageStreamSubscription.ts`

**Interfaces:**
- Consumes: IPC channels (Task 3), `IntentSummary` type (Task 1)
- Produces:
  - `api.stage.intentGenerate(id)`, `api.stage.intentCancel(id)`, `api.stage.onIntentStream(cb)`
  - `useIntentGenerationStore` with state `{ projectId, phase, intent, chars, lastError }` and actions `run/cancel/applyEvent/reset`

- [ ] **Step 1: Add bridge methods**

Read `src/renderer/lib/api.ts` and find the `StageApi` interface (around line 79). Add three methods:

```ts
intentGenerate: (id: string) => ipcRenderer.invoke(IPC.STAGE_INTENT_GENERATE, { id }),
intentCancel: (id: string) => ipcRenderer.invoke(IPC.STAGE_INTENT_CANCEL, { id }),
onIntentStream: (cb: (e: IntentStreamPayload) => void) => {
  const listener = (_e: unknown, payload: IntentStreamPayload) => cb(payload);
  ipcRenderer.on(IPC.STAGE_INTENT_STREAM, listener);
  return () => ipcRenderer.removeListener(IPC.STAGE_INTENT_STREAM, listener);
},
```

Also add to imports:

```ts
import type { IntentGenerateResponse, IntentStreamPayload } from "../../shared/ipc-types.js";
import type { IntentSummary } from "../../shared/intent.js";
```

(Adjust import paths to match local conventions.)

- [ ] **Step 2: Create the intent store**

Create `src/renderer/stores/intentGeneration.ts`:

```ts
import { create } from "zustand";
import { api } from "../lib/api.js";
import type { IntentStreamPayload, IntentSummary } from "../lib/api.js";

export type IntentPhase = "idle" | "running" | "done" | "cancelled" | "error";

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
  projectId: null,
  phase: "idle",
  intent: null,
  chars: 0,
  lastError: null,

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

  reset: () =>
    set({ projectId: null, phase: "idle", intent: null, chars: 0, lastError: null }),
}));
```

- [ ] **Step 3: Wire stream subscription**

Modify `src/renderer/hooks/useStageStreamSubscription.ts` — add the intent subscription:

```ts
import { useIntentGenerationStore } from "../stores/intentGeneration.js";

export function useStageStreamSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onOutlineStream((e) => useStageStreamStore.getState().applyEvent(e));
    const u2 = api.stage.onSlideRegenStream((e) => useStageStreamStore.getState().applyEvent(e));
    const u3 = api.stage.onIntentStream((e) => useIntentGenerationStore.getState().applyEvent(e));
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS — both main and renderer tsconfigs. (Renderer uses the new types from shared; main uses the new IPC channel constants.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/api.ts src/renderer/stores/intentGeneration.ts src/renderer/hooks/useStageStreamSubscription.ts
git commit -m "feat(intent): renderer bridge + store + stream subscription"
```

---

## Task 6: Wire runFullGeneration chain + UI step states

**Files:**
- Modify: `src/renderer/stores/workbench.ts` (`approveOutline`)
- Modify: `src/renderer/workbench/GenerationThinkingPanel.tsx` (add `stepStates` prop)
- Modify: `src/renderer/workbench/GenerationCard.tsx` (compute + pass `stepStates`)
- Modify: `src/renderer/workbench/GenerationProgressPanel.tsx` (compute + pass `stepStates` + error topline)

**Interfaces:**
- Consumes: `useIntentGenerationStore`, `useStageStreamStore`, `usePptGenerationStore` (all existing or Task 5)
- Produces:
  - `approveOutline(id)` chains `intent.run → stageStream.start("outline") → pptGen.start`
  - `GenerationThinkingPanel` accepts optional `stepStates?: Record<string, "pending"|"running"|"done"|"error">`
  - `GenerationCard` / `GenerationProgressPanel` derive `stepStates` from the three stores

- [ ] **Step 1: Replace `pptGen.start` call in approveOutline**

Modify `src/renderer/stores/workbench.ts` — in `approveOutline` (around line 306-330), replace the trailing:

```ts
void usePptGenerationStore.getState().start(id);
```

with:

```ts
void (async () => {
  useIntentGenerationStore.getState().reset();
  try {
    await useIntentGenerationStore.getState().run(id);
    await useStageStreamStore.getState().start("outline", id);
    await usePptGenerationStore.getState().start(id);
  } catch {
    // intent store already set phase=error; GenerationProgressPanel will surface
  }
})();
```

Add import at top:

```ts
import { useIntentGenerationStore } from "./intentGeneration.js";
```

- [ ] **Step 2: Add `stepStates` prop to `GenerationThinkingPanel`**

Modify `src/renderer/workbench/GenerationThinkingPanel.tsx` — extend props:

```ts
export function GenerationThinkingPanel({
  steps,
  activeIndex,
  progress,
  complete,
  stepStates,
}: {
  steps: ExecutionStep[];
  activeIndex: number;
  progress: number;
  complete: boolean;
  stepStates?: Record<string, "pending" | "running" | "done" | "error">;
}) {
```

Replace the per-item `done` / `active` derivation inside `.map(...)`:

```tsx
const done = stepStates?.[item.id] === "done" || progress >= (index + 1) * 20;
const active = stepStates?.[item.id] === "running" || (!done && index === activeIndex);
```

(Default behavior is unchanged when `stepStates` is omitted.)

- [ ] **Step 3: Pass `stepStates` from `GenerationCard`**

Modify `src/renderer/workbench/GenerationCard.tsx`. Add to the top of the function:

```ts
const intentPhase = useIntentGenerationStore((s) => s.phase);
const outlinePhase = useStageStreamStore((s) => s.phase);
const htmlPhase = usePptGenerationStore((s) => s.phase);

const stepStates: Record<string, "pending" | "running" | "done" | "error"> = {
  intent:
    intentPhase === "done" ? "done"
    : intentPhase === "running" ? "running"
    : intentPhase === "error" ? "error"
    : "pending",
  search: "pending",
  outline:
    outlinePhase === "streaming" ? "running"
    : outlinePhase === "done" ? "done"
    : outlinePhase === "error" ? "error"
    : "pending",
  compose:
    htmlPhase === "running" ? "running"
    : htmlPhase === "done" ? "done"
    : htmlPhase === "error" ? "error"
    : "pending",
  verify: "pending",
};
```

Add imports:

```ts
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { useIntentGenerationStore } from "../stores/intentGeneration.js";
```

Pass `stepStates={stepStates}` as a prop to `<GenerationThinkingPanel>`.

- [ ] **Step 4: Pass `stepStates` + intent error topline from `GenerationProgressPanel`**

Modify `src/renderer/workbench/GenerationProgressPanel.tsx` — add the same three-store hooks and `stepStates` derivation as in Step 3, then pass `stepStates={stepStates}`.

Update the `isError` topline to distinguish intent vs HTML error:

```tsx
const intentPhase = useIntentGenerationStore((s) => s.phase);
const intentError = useIntentGenerationStore((s) => s.lastError);
// ...
{isError && (
  <pre className="artifact-progress-error" role="alert">
    {intentPhase === "error" ? `意图提炼失败：${intentError ?? ""}` : lastError?.split("\n").slice(0, 4).join("\n")}
  </pre>
)}
```

- [ ] **Step 5: Run typecheck + full test suite**

Run: `bun run typecheck && bun run test`
Expected: PASS — full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stores/workbench.ts src/renderer/workbench/GenerationThinkingPanel.tsx src/renderer/workbench/GenerationCard.tsx src/renderer/workbench/GenerationProgressPanel.tsx
git commit -m "feat(intent): wire runFullGeneration chain and stepStates UI"
```

---

## Task 7: Build, full regression, manual smoke

**Files:** none modified; verification only.

- [ ] **Step 1: Rebuild main process bundle**

Run: `bun run build:main`
Expected: "Main (ESM) + preload (CJS) built; vendor copied; SDK path rewritten." — no errors.

- [ ] **Step 2: Run full test suite**

Run: `bun run test`
Expected: PASS — all tests green (101 existing + new ones from Tasks 1, 2, 4).

- [ ] **Step 3: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS — both main and renderer tsconfigs.

- [ ] **Step 4: Restart Electron**

```bash
# Cmd+Q to fully quit Electron, then:
bun run dev
```

Expected: Vite + tsc watch + Electron all start cleanly; renderer connects.

- [ ] **Step 5: Manual smoke test**

In the running Electron app:
1. Open an existing project with `brief.json` populated. (Or create a new project, fill brief, advance to outline page.)
2. On the outline page, click "重新生成" / approve outline.
3. **Verify Step 1 spinner**: in the 5-step card, the first item ("理解任务与受众") shows a spinner (not checkmark) within ~1s of click. Previously it instantly showed checkmark.
4. **Verify Step 1 done timing**: after ~3-15s, Step 1 turns green. This is the real LLM latency.
5. **Verify Step 3 (outline) follows**: Step 1 green → Step 3 spinner → eventually Step 3 green → Step 4 spinner.
6. **Verify HTML still runs**: all slides eventually complete as before.
7. **Verify file written**: in `<userData>/projects/<id>/intent.json`, valid JSON matching the schema.
8. **Verify error path**: temporarily disconnect network / set invalid API key in settings, retry — verify Step 1 turns red error state and `lastError` surfaces in `GenerationProgressPanel`.
9. **Verify reopen + regenerate**: reload the project, click 重新生成 — intent runs again (no caching).

- [ ] **Step 6: Commit verification artifacts (if any)**

If `paths.ts` was modified in Task 1 Step 5 to honor `ZN_AGENTIC_PPT_TEST_DATA_DIR`:

```bash
git log --oneline -1  # verify commit exists from Task 1
```

Otherwise no commit needed.

---

## Summary

**Total:** 7 tasks, ~17 files, ~545 LOC increment.

**Commit history (one per task):**
1. `feat(intent): add IntentSummary schema + FS persistence`
2. `feat(intent): add INTENTION_PROMPT and registration`
3. `feat(intent): add IPC channels and payload types`
4. `feat(intent): add IPC handlers and inject intent into outline prompt`
5. `feat(intent): renderer bridge + store + stream subscription`
6. `feat(intent): wire runFullGeneration chain and stepStates UI`
7. (no commit — verification only)

**TDD coverage:** Tasks 1, 2, 4 write failing tests first. Tasks 3, 5, 6 are wiring (covered by `bun run typecheck` + smoke). Task 7 is end-to-end verification.

**Risks / things to watch during execution:**
- `getProjectDir` in `src/main/fs/paths.ts` may need a test-data-dir fallback (Task 1, Step 5). If absent, add it.
- Existing `OUTLINE_PROMPT` users (renderer settings override flow) may have stale templates that lack the `intentJson` variable. If `fillTemplate` throws "rendering variable intentJson missing", the spec says we accept the failure (fast-fail propagation). Document in commit message.
- Task 6 Step 1's `approveOutline` change wraps the `void usePptGenerationStore.getState().start(id)` in an async IIFE — verify `void` keyword prevents unhandled rejection warnings.
- Manual smoke (Task 7 Step 5) requires a project with valid brief. If none exists, create one first via the wizard.