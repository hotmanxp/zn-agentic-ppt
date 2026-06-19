import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../../src/main/fs/settings.js', () => ({
  getPromptOverride: vi.fn(),
}))

import { renderPrompt, getSpec, PROMPT_SPECS } from '../../../../../src/main/sdk/prompts/index.js'
import { getPromptOverride } from '../../../../../src/main/fs/settings.js'

describe('renderPrompt', () => {
  beforeEach(() => vi.mocked(getPromptOverride).mockReset())

  it('uses default template when no override set', async () => {
    vi.mocked(getPromptOverride).mockResolvedValue(null)
    const out = await renderPrompt('outline', { topic: 'X', source: 'Y' })
    expect(out).toContain('X')
    expect(out).toContain('Y')
  })

  it('uses override template when set', async () => {
    vi.mocked(getPromptOverride).mockResolvedValue('CUSTOM {{topic}}')
    const out = await renderPrompt('outline', { topic: 'Z', source: 'W' })
    expect(out).toBe('CUSTOM Z')
  })

  it('throws on unknown prompt id', async () => {
    await expect(renderPrompt('nonexistent', {}))
      .rejects.toThrowError(/未知 prompt/)
  })

  it('throws when caller omits a variable', async () => {
    vi.mocked(getPromptOverride).mockResolvedValue(null)
    await expect(renderPrompt('outline', { topic: 'X' }))
      .rejects.toThrowError(/缺值/)
  })

  it('getSpec returns registered spec', () => {
    expect(getSpec('outline')).not.toBeNull()
    expect(PROMPT_SPECS.length).toBeGreaterThanOrEqual(4)
  })
})
