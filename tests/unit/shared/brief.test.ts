import { describe, it, expect } from 'vitest'
import { computePageCountEst, validateBrief } from '../../../src/shared/brief.js'

describe('computePageCountEst', () => {
  it('clamps to min 3 for very short durations', () => {
    expect(computePageCountEst(1)).toBe(3)
  })
  it('rounds 30 min to 20 pages', () => {
    expect(computePageCountEst(30)).toBe(20)
  })
  it('clamps to max 60 for very long durations', () => {
    expect(computePageCountEst(180)).toBe(60)
  })
})

describe('validateBrief', () => {
  const valid = {
    name: 'AI 在教育中的应用',
    audience: '中学老师',
    durationMinutes: 30,
    content: '- 现状\n- 痛点',
    style: '深色科技',
  }
  it('passes for valid input and computes pageCountEst', () => {
    const r = validateBrief(valid)
    expect(r.pageCountEst).toBe(20)
    expect(r.name).toBe('AI 在教育中的应用')
  })
  it('throws PARSE when name is empty', () => {
    expect(() => validateBrief({ ...valid, name: '' })).toThrow(/name/)
  })
  it('throws PARSE when durationMinutes out of range', () => {
    expect(() => validateBrief({ ...valid, durationMinutes: 0 })).toThrow(/durationMinutes/)
    expect(() => validateBrief({ ...valid, durationMinutes: 121 })).toThrow(/durationMinutes/)
  })
  it('truncates fields over max length', () => {
    const r = validateBrief({ ...valid, name: 'a'.repeat(100) })
    expect(r.name.length).toBe(30)
  })
})
