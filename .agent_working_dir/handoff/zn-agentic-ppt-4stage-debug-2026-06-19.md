# zn-agentic-ppt 4-stage flow debug

## Original Request

User ran through a 19-task plan to build zn-agentic-ppt MVP, then designed and executed a 16-task 4-stage PPT flow refactor (spec + plan committed to opencc repo). After tagging v0.2.0-4stage, user tried the app manually and reported: "点AI生成大纲一直显示生成中" (clicking AI generate outline keeps showing "generating").

## Goal

Identify and fix the Stage 2 generation hang. The user should be able to click "下一步：生成大纲" in Stage 1 and successfully transition to Stage 2 (OutlinePage) with the LLM-generated outline.

## Artifacts

**Project:** `/Users/ethan/code/zn-agentic-ppt/` (Electron + React + Antd + Zustand, tag `v0.2.0-4stage` at `0847baa`)

**OpenCC repo (spec/plan + memory):**
- `docs/superpowers/specs/2026-06-19-4-stage-ppt-flow-design.md` (12 sections, 346 lines, commit `a197b770`)
- `docs/superpowers/plans/2026-06-19-4-stage-ppt-flow.md` (16 tasks, 1863 lines, commit `228cb087`)
- `memory/feedback/team/opencc-subagent-askuserquestion-enhancement-2026-06-19.md` (validated by T8-T11)

**16 plan task commits (in zn-agentic-ppt):**
T1 `3e65c33` types, T2 `e560869` IPC channels, T3 `f8970ad` fs/outline, T4 `f4e97b1` prompts, T5 `cb38eed` html-splice, T6 `b15de23` stage IPC, T7 `c12a7cb` preload, T8 `ea97d34` store, T9 `4198657` stepper+nav, T10 `0bc1938` CollectEditor, T11 `5b21d8d` OutlinePage, T12 `bd3b848` GeneratePage, T13 `0847baa` FineTunePage, T14 `ec614ba` wire routes, T15 `efc54f6` e2e, **+fixup** `3c4c991` wrap in <AntdApp>, +debug logging in stage.ts (uncommitted).

## Key Findings

1. **AntdApp fix landed first** (`3c4c991`): wrapped `<HashRouter>` in `<AntdApp>` so `App.useApp()` returns the message API. This fixed the original "l.success is not a function" error. But the hang persists — the message API now works but the IPC call doesn't return.

2. **Two debug scripts written** to bypass Electron and call the SDK directly:
   - `debug-stage.mjs` — full simulation of the IPC handler path (read project, read source, build outline prompt, call SDK query, parse JSON, write outline.json)
   - `test-sdk.mjs` — minimal SDK test ("Reply with just the word 'pong'")
   - Both ran in background (BQ7ZRSNB7, B5K8FZP3V) and were still running when handoff was triggered
   - **`debug-stage.mjs` produced 0 bytes output** despite `pkill Electron` + 90s timeout. This is the strongest signal: the LLM call is hanging at the SDK layer, NOT in the IPC handler wrapping.

3. **Earlier successful LLM test** (before 4-stage refactor): `try-generate.ts` produced 7109-byte HTML in ~3s. Same SDK, same settings, same vendor/sdk.mjs. So the SDK itself works.

4. **Hypothesis (unverified)**: the new STAGE_OUTLINE_GENERATE handler in `src/main/ipc/stage.ts` passes `outline: source` (the raw text) as the GenerationRunner's "outline" field. The GenerationRunner uses this as the prompt content. The runner code may have changed since the original 19-task plan, OR there's a new issue with how the prompt is constructed. The buildOutlinePrompt produces a systemPrompt; the runner may be ignoring it or sending both in a way that confuses the API.

5. **Project structure is correct** — `~/.zn-agentic-ppt/settings.json` has MiniMax config, `~/.zn-agentic-ppt/projects/<id>/meta.json` has the project, no `source.txt` yet for the new project (debug script writes a fallback).

## Pitfalls

- **`App.useApp()` requires `<App>` wrapper** — Antd 5 returns empty object without it. Plan omitted the wrapper; caught only at runtime. Add `<App>` (or aliased `<AntdApp>`) in App.tsx for any future Antd v5 message/notification/modal usage.
- **Plan reviewer cannot catch spec/code contract issues** — implementer fixed 2 spec-vs-type contradictions (lastError on ProjectMeta, mkdirSync import path) and 1 logical test bug. Reviewer passes when verifier can't actually compile.
- **LLM call from IPC handler hangs** but the same SDK from a standalone script may also hang. Need to compare timings: standalone `try-generate.ts` (3s) vs IPC `STAGE_OUTLINE_GENERATE` (hang). If both hang now, MiniMax endpoint may be rate-limited or down.
- **Console.log in main process not visible** in /tmp/zn-app.log unless the main process's stderr/stdout is piped. We DO pipe (`pnpm start > /tmp/zn-app.log 2>&1`) but only the renderer-error handler and Node-side logs show. Uncaught errors in the IPC handler should be caught by ipcMain.handle and propagated back as promise rejections to the renderer.

## Current TaskList

- [running] #bq7zrsnb7 local_bash — Run debug script to test SDK call outside Electron
- [running] #b5k8fzp3v local_bash — Run minimal SDK test
- [pending] #58 — Debug: Stage 2 generation hangs

## Next Steps

1. **Read debug script outputs**: `cat /private/tmp/claude-501/-Users-ethan-code-opencc/ccae89d4-4f84-46b7-906f-0650dcffd6ff/tasks/{bq7zrsnb7,b5k8fzp3v}.output` — if either is non-empty after 60+ seconds, the LLM itself is the problem (rate limit / endpoint down / api key rotated). If both stay 0 bytes for 90s, the issue is the script itself (import resolution, missing node_modules path).

2. **Compare with successful try-generate.ts** (3-second generation from earlier in same session): if that script also now hangs, MiniMax endpoint is the issue — try `https://api.anthropic.com` with a real Anthropic key, or wait and retry.

3. **If scripts succeed but IPC hangs**: the bug is in the IPC handler's `GenerationRunner` invocation. Most likely culprit: the `outline: source` field — `GenerationRunner` is designed to take a short outline string, not a long document. Need to construct the runner differently for Stage 2 (put the source in `systemPrompt` and pass empty outline, or pass JSON-stringified context).

4. **Fix STAGE_OUTLINE_GENERATE in `src/main/ipc/stage.ts`** to NOT use `outline: source` as the prompt content. Options:
   - Pass empty outline, put entire context in systemPrompt (cleanest)
   - OR construct the prompt manually: `prompt: 'Generate the outline now.'` (current code does this implicitly via `GenerationRunner`)
   - OR call `query()` directly (bypass GenerationRunner) for outline gen — it's a different shape

5. **After fix**: remove the debug console.log lines, rebuild, restart app, retest.

## Skills Used

- `superpowers:brainstorming` — design phase (4-stage flow)
- `superpowers:writing-plans` — 16-task plan
- `superpowers:subagent-driven-development` — executed 16 plan tasks; pattern worked cleanly (8 subagent self-fixes, 1 coordinator App.tsx fixup)
- `superpowers:finishing-a-development-branch` — applied but no merge needed (single new repo)
