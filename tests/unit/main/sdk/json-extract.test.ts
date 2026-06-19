import { describe, it, expect } from 'vitest'
import { extractFirstJsonObject } from '../../../../src/main/sdk/json-extract.js'

describe('extractFirstJsonObject', () => {
  it('returns parsed object from pure JSON', () => {
    const r = extractFirstJsonObject('{"slides":[{"title":"A"}]}')
    expect(r).toEqual({ slides: [{ title: 'A' }] })
  })

  it('handles JSON wrapped in markdown code fences', () => {
    const buf = '```json\n{"slides":[{"title":"A","bullets":[]}]}\n```'
    expect(extractFirstJsonObject(buf)).toEqual({ slides: [{ title: 'A', bullets: [] }] })
  })

  it('stops at the closing brace, ignoring trailing commentary', () => {
    const buf = 'Here you go:\n{"slides":[{"title":"A"}]}\nLet me know if you need changes.'
    expect(extractFirstJsonObject(buf)).toEqual({ slides: [{ title: 'A' }] })
  })

  it('handles braces inside string values', () => {
    const buf = '{"slides":[{"title":"A } curly","bullets":["x"]}]}'
    expect(extractFirstJsonObject(buf)).toEqual({ slides: [{ title: 'A } curly', bullets: ['x'] }] })
  })

  it('handles escaped quotes inside string values', () => {
    const buf = '{"slides":[{"title":"She said \\"hi\\"","bullets":[]}]}'
    expect(extractFirstJsonObject(buf)).toEqual({ slides: [{ title: 'She said "hi"', bullets: [] }] })
  })

  it('throws when no JSON object is present', () => {
    expect(() => extractFirstJsonObject('no json here')).toThrow('No JSON object found')
  })

  it('throws when buffer is empty', () => {
    expect(() => extractFirstJsonObject('')).toThrow('No JSON object found')
  })

  it('throws on unbalanced braces', () => {
    expect(() => extractFirstJsonObject('{"slides":[{"title":"A"}]')).toThrow('Unbalanced JSON')
  })

  it('ignores braces that appear before the first object start', () => {
    const buf = 'Note: use {curly} carefully. {"slides":[{"title":"A"}]}'
    expect(extractFirstJsonObject(buf)).toEqual({ slides: [{ title: 'A' }] })
  })
})
