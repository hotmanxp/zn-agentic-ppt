import { describe, it, expect } from 'vitest'
import { extractFirstJsonObject, extractFirstJsonValue } from '../../../../src/main/sdk/json-extract.js'

describe('extractFirstJsonObject (deprecated alias)', () => {
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

describe('extractFirstJsonValue (new — handles objects AND arrays)', () => {
  it('returns parsed object from pure JSON', () => {
    const r = extractFirstJsonValue('{"x":1,"y":[2,3]}')
    expect(r).toEqual({ x: 1, y: [2, 3] })
  })

  it('returns parsed array when LLM responds with [...]', () => {
    const r = extractFirstJsonValue('[{"a":1},{"b":2}]')
    expect(r).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('returns whichever delimiter appears first (object or array)', () => {
    // First non-whitespace delimiter is `[`, so we parse the array.
    const r = extractFirstJsonValue('[1,2] then {"x":3}')
    expect(r).toEqual([1, 2])
  })

  it('returns object when buffer starts with {', () => {
    const r = extractFirstJsonValue('{"x":3} then [1,2]')
    expect(r).toEqual({ x: 3 })
  })

  it('handles markdown-fenced object', () => {
    const buf = '```json\n{"x":42}\n```'
    expect(extractFirstJsonValue(buf)).toEqual({ x: 42 })
  })

  it('handles markdown-fenced array', () => {
    const buf = '```json\n[1,2,3]\n```'
    expect(extractFirstJsonValue(buf)).toEqual([1, 2, 3])
  })

  it('strips fences without language tag too', () => {
    const buf = '```\n{"a":1}\n```'
    expect(extractFirstJsonValue(buf)).toEqual({ a: 1 })
  })

  it('ignores prose before the JSON', () => {
    const buf = 'Here is your outline:\n{"x":1}'
    expect(extractFirstJsonValue(buf)).toEqual({ x: 1 })
  })

  it('handles nested arrays inside objects', () => {
    const buf = '{"slides":[{"title":"A","bullets":["x","y"]},{"title":"B","bullets":["z"]}]}'
    const r = extractFirstJsonValue(buf) as { slides: Array<{ title: string; bullets: string[] }> }
    expect(r.slides).toHaveLength(2)
    expect(r.slides[0].bullets).toEqual(['x', 'y'])
  })

  it('handles braces in string values (does not count them)', () => {
    const buf = '{"slides":[{"title":"A } curly","bullets":["x"]}]}'
    expect(extractFirstJsonValue(buf)).toEqual({ slides: [{ title: 'A } curly', bullets: ['x'] }] })
  })

  it('handles escaped quotes inside string values', () => {
    const buf = '{"title":"She said \\"hi\\""}'
    expect(extractFirstJsonValue(buf)).toEqual({ title: 'She said "hi"' })
  })

  it('throws on empty buffer', () => {
    expect(() => extractFirstJsonValue('')).toThrow('No JSON value found in buffer')
  })

  it('throws on text-only buffer (no JSON)', () => {
    expect(() => extractFirstJsonValue('just some prose, no JSON here')).toThrow('No JSON value found in buffer')
  })

  it('throws on unbalanced JSON', () => {
    expect(() => extractFirstJsonValue('{"x":1,[unclosed')).toThrow(/Unbalanced JSON/)
  })

  it('skips stray `{word}` and finds the real JSON object after', () => {
    const buf = 'Note: use {curly} carefully. {"real":"object"}'
    expect(extractFirstJsonValue(buf)).toEqual({ real: 'object' })
  })

  it('handles deeply nested JSON (object → array → object)', () => {
    const buf = '{"a":[{"b":[{"c":42}]}]}'
    expect(extractFirstJsonValue(buf)).toEqual({ a: [{ b: [{ c: 42 }] }] })
  })
})
