import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})

test.afterAll(async () => {
  await app.close()
})

test('create → edit → editor opens', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })
  await page.getByRole('button', { name: '+ 新建项目' }).first().click()
  await page.getByPlaceholder(/主题/).fill('测试主题')
  await page.getByRole('button', { name: '确 定' }).click()
  await expect(page.locator('text=⚡ 生成 PPT')).toBeVisible({ timeout: 10000 })
})
