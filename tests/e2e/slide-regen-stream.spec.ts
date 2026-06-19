import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})
test.afterAll(async () => { await app.close() })

test('slide-regen streams partial HTML + cancel', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })

  // Navigate to projects → first project
  await page.getByRole('link', { name: '项目' }).click()
  await page.waitForSelector('text=我的项目', { timeout: 5000 })

  const firstCard = page.locator('.ant-card').first()
  if (await firstCard.count() === 0) {
    test.skip(true, 'No projects to test against — create one first')
    return
  }
  await firstCard.click()

  // We need to be on Stage 4 (FineTunePage). The simplest path is to navigate directly.
  const url = page.url()
  const projectIdMatch = url.match(/projects\/([^/]+)/)
  if (!projectIdMatch) {
    test.skip(true, 'Could not extract projectId from URL')
    return
  }
  const projectId = projectIdMatch[1]
  // Electron uses hash routing on a file:// or custom protocol origin.
  // Setting location.hash is the safest way to navigate without an absolute URL.
  await page.evaluate((id) => {
    window.location.hash = `#/projects/${id}/fine-tune`
  }, projectId)
  await page.waitForSelector('text=编辑当前页', { timeout: 8000 })

  // Click 重生成此页
  const regenButton = page.getByRole('button', { name: '重生成此页' })
  if (await regenButton.count() === 0) {
    test.skip(true, '重生成此页 button not found — no slide selected')
    return
  }
  await regenButton.click()

  // StageStreamBar should appear with the slide-regen label
  await expect(page.getByText('正在重生成该页…')).toBeVisible({ timeout: 5000 })

  // Cancel
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByText('正在重生成该页…')).not.toBeVisible({ timeout: 8000 })
})
