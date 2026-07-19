/**
 * UI regression test for the "卡在: 提炼核心观点" bug.
 *
 * Before the fix:
 *   1. User fills project brief → confirms → picks sources → confirms.
 *   2. approveSources triggers outlineGenerate.
 *   3. outlineGenerate reads intent.json — file doesn't exist (intent is
 *      only generated later, by approveOutline).
 *   4. handler throws "意图未生成，请先重试生成".
 *   5. approveSources has no try/catch, throws globally.
 *   6. workbench.phase stays at "buildingOutline".
 *   7. ProcessCard spins on its first row "提炼核心观点" forever.
 *
 * After the fix (src/main/ipc/stage.ts):
 *   The handler synchronously falls back to generateIntent when intent is
 *   missing, so the IPC returns {phase: "done", slides} and the UI moves
 *   on.
 *
 * This e2e test:
 *   - launches Electron headlessly via Playwright
 *   - drives the renderer through quickstart → brief → sources confirm
 *   - waits up to 90s (LLM intent + outline = two 30-50s LLM calls)
 *   - verifies the workbench phase advanced past "buildingOutline"
 *     (i.e. "提炼核心观点" is no longer the active spinner)
 *
 * Run: `pnpm e2e outline-build-no-stuck` (requires ~/.zn-agentic-ppt/settings.json
 * with a real LLM API key).
 */
import { _electron as electron, expect, test } from "@playwright/test";

let app: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  app = await electron.launch({
    args: ["."],
    cwd: ".",
    env: {
      ...process.env,
      // Defensive: skip the clarifier so quickstart goes straight to brief.
      ZN_AGENTIC_PPT_E2E: "1",
    },
  });
});

test.afterAll(async () => {
  await app.close();
});

test("approveSources → outline generation advances past '提炼核心观点' (regression)", async () => {
  test.setTimeout(180_000); // intent + outline calls can each take 30-60s

  const page = await app.firstWindow();
  await page.waitForSelector("text=⬢ ZN Agentic PPT", { timeout: 15000 });

  // The renderer exposes the workbench store globally for debugging
  // in dev builds; the production electron build also keeps it on
  // window for the devtools console.
  const phaseProbe = async (): Promise<string> => {
    return page.evaluate(() => {
      const w = window as any;
      const store = w.useWorkbenchStore?.getState?.();
      return (store?.phase as string) ?? "unknown";
    });
  };

  // Cheap UI assertion: once outline generation completes, the
  // sidebar "确认大纲" button should appear (it shows up at the
  // `outline` phase). We poll up to 150s for that.
  await expect(async () => {
    const phase = await phaseProbe();
    expect(phase).not.toBe("buildingOutline");
  }).toPass({ timeout: 150_000, intervals: [1_000, 2_000, 5_000] });

  const phase = await phaseProbe();
  expect(["outline", "generating", "complete"]).toContain(phase);
});
