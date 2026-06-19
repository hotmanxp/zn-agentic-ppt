import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getSettings, setSettings, setSettingsPathForTest, defaultSettings,
  getPromptOverride, setPromptOverride, resetPromptOverride, listPromptOverrides,
} from '../../../../src/main/fs/settings.js'

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

describe('fs/settings prompt overrides', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'znap-set-'))
    setSettingsPathForTest(join(dir, 'settings.json'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns null when not set', async () => {
    expect(await getPromptOverride('outline')).toBeNull()
  })

  it('persists override via setPromptOverride', async () => {
    await setPromptOverride('outline', 'CUSTOM TEMPLATE')
    expect(await getPromptOverride('outline')).toBe('CUSTOM TEMPLATE')
  })

  it('resetPromptOverride deletes the override', async () => {
    await setPromptOverride('outline', 'X')
    await resetPromptOverride('outline')
    expect(await getPromptOverride('outline')).toBeNull()
  })

  it('listPromptOverrides returns only set overrides', async () => {
    await setPromptOverride('outline', 'A')
    await setPromptOverride('regenerate', 'B')
    const list = await listPromptOverrides()
    expect(list.outline).toBe('A')
    expect(list.regenerate).toBe('B')
    expect(list['slide-system']).toBeUndefined()
  })

  it('survives settings read/write cycle', async () => {
    await setPromptOverride('outline', 'PERSIST')
    await setSettings(await getSettings())
    expect(await getPromptOverride('outline')).toBe('PERSIST')
  })
})
