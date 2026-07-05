import { _electron as electron, expect, test } from "@playwright/test";

let app: Awaited<ReturnType<typeof electron.launch>>;

test.beforeAll(async () => {
  app = await electron.launch({ args: ["."], cwd: "." });
});

test.afterAll(async () => {
  await app.close();
});

test("app launches and shows welcome page", async () => {
  const page = await app.firstWindow();
  await page.waitForSelector("text=⬢ ZN Agentic PPT", { timeout: 15000 });
  await expect(page.locator("text=用 AI 几秒生成演示文稿")).toBeVisible();
});
