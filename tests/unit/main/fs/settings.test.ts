import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSettings, setSettings, setSettingsPathForTest, defaultSettings } from '../../../../src/main/fs/settings.js'

describe('fs/settings', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'znap-set-'))
    setSettingsPathForTest(join(dir, 'settings.json'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('getSettings returns defaults when file missing', async () => {
    const s = await getSettings()
    expect(s.llm.provider).toBe('anthropic')
  })

  it('setSettings persists and getSettings reads back', async () => {
    await setSettings({ ...defaultSettings(), llm: { ...defaultSettings().llm, baseUrl: 'https://x' } })
    const s = await getSettings()
    expect(s.llm.baseUrl).toBe('https://x')
  })

  it('getSettings recovers from corrupt file with defaults', async () => {
    writeFileSync(join(dir, 'settings.json'), 'not json')
    const s = await getSettings()
    expect(s.llm.provider).toBe('anthropic')
  })
})
