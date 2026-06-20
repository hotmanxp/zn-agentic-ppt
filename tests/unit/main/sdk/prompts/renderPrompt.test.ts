import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../../src/main/fs/settings.js', () => ({
  getPromptOverride: vi.fn(),
}))

import { renderPrompt, getSpec, PROMPT_SPECS } from '../../../../../src/main/sdk/prompts/index.js'
import { getPromptOverride } from '../../../../../src/main/fs/settings.js'
import { briefOptimizePrompt } from '../../../../../src/main/sdk/prompts/brief-optimize.js'

const mockGetPromptOverride = getPromptOverride as unknown as ReturnType<typeof vi.fn>

describe('renderPrompt', () => {
  beforeEach(() => mockGetPromptOverride.mockReset())

  it('uses default template when no override set', async () => {
    mockGetPromptOverride.mockResolvedValue(null)
    const out = await renderPrompt('OUTLINE_PROMPT', {
      briefName: 'X', briefAudience: 'aud', briefDurationMinutes: '30',
      briefContent: 'Y', briefStyle: 'tech',
    })
    expect(out).toContain('X')
    expect(out).toContain('Y')
  })

  it('uses override template when set', async () => {
    mockGetPromptOverride.mockResolvedValue('CUSTOM {{briefName}}')
    const out = await renderPrompt('OUTLINE_PROMPT', {
      briefName: 'Z', briefAudience: 'aud', briefDurationMinutes: '30',
      briefContent: 'W', briefStyle: 'tech',
    })
    expect(out).toBe('CUSTOM Z')
  })

  it('throws on unknown prompt id', async () => {
    await expect(renderPrompt('nonexistent', {}))
      .rejects.toThrowError(/未知 prompt/)
  })

  it('throws when caller omits a variable', async () => {
    mockGetPromptOverride.mockResolvedValue(null)
    await expect(renderPrompt('OUTLINE_PROMPT', {
      briefName: 'X', briefAudience: 'aud', briefDurationMinutes: '30',
      briefContent: 'c',
    }))
      .rejects.toThrowError(/缺值/)
  })

  it('getSpec returns registered spec', () => {
    expect(getSpec('OUTLINE_PROMPT')).not.toBeNull()
    expect(PROMPT_SPECS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('brief-optimize prompt', () => {
  it('declares source, hintJson, retryContext variables', () => {
    const names = briefOptimizePrompt.variables.map(v => v.name)
    expect(names).toEqual(['source', 'hintJson', 'retryContext'])
  })
  it('instructs agent to use AskUserQuestion tool', () => {
    expect(briefOptimizePrompt.defaultTemplate).toMatch(/AskUserQuestion/)
  })
  it('lists 5 output fields', () => {
    const t = briefOptimizePrompt.defaultTemplate
    expect(t).toMatch(/"name"/)
    expect(t).toMatch(/"audience"/)
    expect(t).toMatch(/"durationMinutes"/)
    expect(t).toMatch(/"content"/)
    expect(t).toMatch(/"style"/)
  })
})
