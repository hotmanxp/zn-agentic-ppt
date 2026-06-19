import { test, expect } from '@playwright/test'

test('create → edit outline → generate → preview appears', async ({ page }) => {
  await page.getByRole('button', { name: '+ 新建项目' }).first().click()
  await page.getByPlaceholder(/主题/).fill('测试主题')
  await page.getByRole('button', { name: '确 定' }).click()
  await expect(page.locator('text=⚡ 生成 PPT')).toBeVisible()
  await page.locator('textarea').fill('# 标题\n\n要点 1\n要点 2\n\n# 第二页\n- 子点')
  await page.getByRole('button', { name: '⚡ 生成 PPT' }).click()
  await page.waitForTimeout(2000)
})
