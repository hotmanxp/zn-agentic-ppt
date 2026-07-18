import { test, expect } from "@playwright/test";

test.describe("PPT sub-agent cancel propagation", () => {
  test("cancel during sub-agent generation finishes within 10s with cancelled=true", async ({ page }) => {
    // 进 workbench，新建任务，跑 outline → generation
    // 5 秒后点击 "取消生成"
    // 断言 STAGE_HTML_GENERATE_DONE 广播 10 秒内到达且 cancelled=true
    test.skip(true, "需要真实 LLM + BackgroundRuntime 环境；本地 mock 测不到。开发机手动验证：开 Electron 触发 generation，5s 后点取消，看 DevTools console STAGE_HTML_GENERATE_DONE 何时到达。");
  });
});
