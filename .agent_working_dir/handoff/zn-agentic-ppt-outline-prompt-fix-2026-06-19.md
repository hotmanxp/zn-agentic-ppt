# zn-agentic-ppt outline prompt fix

## Original Request

User reported Stage 2 (outline generation) hangs after 19-task MVP plan was already shipped as `mvp-0.1.0`. Asked how prompts are written, what LLM returns, what system prompt is. After my analysis, I proposed fixing the prompt bug.

## Goal

STAGE_OUTLINE_GENERATE produces a valid outline JSON (not a 15KB HTML document) within 30 seconds via in-app IPC.

## Artifacts

- `src/main/sdk/runner.ts` — added `systemPrompt` and `userMessage` options to `RunnerOptions` (the hardcoded `buildSystemPrompt(topic, outline)` is now the fallback)
- `src/main/ipc/stage.ts` — STAGE_OUTLINE_GENERATE now passes `buildOutlinePrompt(project.topic, source)` as `systemPrompt`; STAGE_SLIDE_REGENERATE now passes `buildRegeneratePrompt(target, others, currentSectionHtml)` as `systemPrompt`
- Memory: `opencc-esbuild-esm-no-require-2026-06-19.md` (ESM bundle `require()` rule)
- Memory: `opencc-controller-dont-restart-app-user-is-using-2026-06-19.md` (don't kill+restart user's active app during debug)
- Commit `21c3059` — runner + stage fix, 16 insertions 2 deletions
- Previous handoff: `zn-agentic-ppt-4stage-debug-2026-06-19.md` (initial hang diagnosis)
- App running PID 98818 in `/Users/ethan/code/zn-agentic-ppt/`

## Key Findings

1. **Root cause of Stage 2 hang**: `GenerationRunner.run()` in `src/main/sdk/runner.ts` hardcoded `buildSystemPrompt(topic, outline)` (the HTML PPT prompt). For Stage 2 outline gen, this made LLM emit 15KB HTML instead of 500-byte JSON. The handler's JSON regex then failed, throwing "LLM did not return JSON" which the user saw as a hang (no error toast because `<App>` wrapper was also missing — fixed earlier in `3c4c991`).

2. **buildOutlinePrompt was never called** despite being defined in `src/main/sdk/outline-prompt.ts` during Plan Task 4. Same for `buildRegeneratePrompt`. The plan's IPC stage.ts literally pasted in the wrong `outline` field for both.

3. **LLM (MiniMax-M3) takes ~30s for outline JSON**, ~60s+ for full HTML PPT. Suggest user switch to `MiniMax-M2.7-highspeed` (3s in earlier test) for faster iteration.

4. **esbuild ESM + `require()`** = "Dynamic require of X is not supported" runtime error. The user's earlier "hang" might have been my debug `require('node:fs')` calls; now cleaned up.

## Pitfalls

- **`require()` in esbuild-bundled ESM code throws at runtime** (saved as memory rule). Use `import` (top-level) or `await import()` (dynamic).
- **Don't kill + restart the user's active Electron app repeatedly during debug** — file-based logging is enough. User complained about "页面来回打开" because of my pkill loops.
- **Runner shared between 3 stages but hardcoded HTML PPT prompt** — Plan Task 6 (main IPC) inherited this from the original 19-task plan. Plan Task 4 defined stage-specific prompt builders but never wired them. Plan reviewer didn't catch this because handlers "worked" if you ignore the 60s+ LLM call and the JSON-extraction failure.
- **Playwright `_electron` launches a separate Electron from the user's running one** — both run concurrently and each registers all IPC handlers. Don't confuse the two when reading logs.
- **The `outline` field in RunnerOptions is misleading** — it's the prompt body, not a structured outline. Should be renamed in next refactor.

## Current TaskList

(empty — all tasks completed in this session)

## Next Steps

1. **Test in app**: user should re-test Stage 1 → Stage 2 → Stage 3 → Stage 4. Outline should appear in ~30s with the new prompt.
2. **Consider speed-up**: change `~/.zn-agentic-ppt/settings.json` `model` to `MiniMax-M2.7-highspeed` (verified 3s in earlier test).
3. **Add UX progress indicator**: Stage 1 button currently just shows "生成中..." with no progress. Consider streaming events for outline (already wired `STAGE_OUTLINE_STREAM` IPC channel, not yet used in renderer).
4. **Refactor runner**: rename `outline` to `promptBody` or `userMessage` to avoid future confusion. Or split into `OutlineRunner`/`HtmlRunner`/`SlideRunner` classes.
5. **Add timeout**: all IPC handlers should have a hard timeout (e.g. 90s) so user gets a clear error instead of infinite spinner if LLM hangs.
6. **Plan Task 4's prompts need spec compliance check**: `buildRegeneratePrompt` and `buildOutlinePrompt` are now wired but should be unit-tested for the JSON shape they request.
7. **Run final E2E + tag**: the 4-stage plan's Task 16 needs re-verification after the prompt fix. Tag as `v0.2.1-outline-fix` or similar.

## Skills Used

- `superpowers:brainstorming` — used earlier in the day to design the 4-stage flow spec
- `superpowers:writing-plans` — wrote the 16-task plan (all shipped)
- `superpowers:subagent-driven-development` — executed 16 plan tasks (one coordinator fixup for `<AntdApp>` wrapper, otherwise clean)
- `superpowers:finishing-a-development-branch` — applied after plan completion, but no remote to push to (brand new repo)
- `superpowers:systematic-debugging` (implicit pattern) — captured the 5-minute decision tree when the user said "不行" (didn't work): test isolation, then layer-by-layer log instrumentation, then root-cause via `require()` in ESM
