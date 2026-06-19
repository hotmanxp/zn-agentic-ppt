import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})
test.afterAll(async () => { await app.close() })

test('outline streaming progress bar + cancel button', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })

  // Navigate to projects page
  await page.getByRole('link', { name: '项目' }).click()
  await page.waitForSelector('text=我的项目', { timeout: 5000 })

  // Open first project (or create one if none exist)
  const firstCard = page.locator('.ant-card').first()
  if (await firstCard.count() === 0) {
    test.skip(true, 'No projects to test against — create one first')
    return
  }
  await firstCard.click()
  await page.waitForURL(/#\/projects\/[^/]+\/collect/, { timeout: 8000 })

  // We are now on Stage 1 (CollectEditor). Fill the topic + source.
  const topicInput = page.getByPlaceholder('项目主题')
  if (await topicInput.count() === 0) {
    test.skip(true, 'Topic input not found — already past Stage 1')
    return
  }
  await topicInput.fill('E2E streaming test')
  await page.getByPlaceholder('把你的内容粘贴到这里...').fill('Test content for streaming progress. '.repeat(20))

  // Click 下一步
  await page.getByRole('button', { name: '下一步' }).click()

  // StageStreamBar should appear with progress text
  await expect(page.getByText('正在生成大纲…')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/已生成 \d+ 字符/)).toBeVisible({ timeout: 5000 })

  // Wait for chars to grow (LLM takes time)
  await page.waitForTimeout(5000)
  const firstText = await page.getByText(/已生成 \d+ 字符/).first().innerText()
  const firstMatch = firstText.match(/(\d+)/)
  const firstChars = firstMatch ? Number.parseInt(firstMatch[1], 10) : 0
  expect(firstChars).toBeGreaterThan(0)

  // Click 取消
  await page.getByRole('button', { name: '取消' }).click()

  // Bar should unmount or show cancelled; "已取消" toast may appear
  await expect(page.getByText('正在生成大纲…')).not.toBeVisible({ timeout: 8000 })
})
