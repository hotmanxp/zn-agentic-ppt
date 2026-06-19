import { describe, it, expect } from 'vitest'
import { fillTemplate } from '../../../../../src/main/sdk/prompts/index.js'

describe('fillTemplate', () => {
  const vars = [
    { name: 'topic', description: '主题', type: 'string' as const },
    { name: 'source', description: '源内容', type: 'string' as const },
    { name: 'target', description: '目标页', type: 'json' as const },
  ]

  it('replaces string variables', () => {
    const out = fillTemplate('主题是 {{topic}}', { topic: 'AI PPT' }, vars)
    expect(out).toBe('主题是 AI PPT')
  })

  it('replaces json variables with 2-space JSON', () => {
    const out = fillTemplate('{{target}}', { target: { title: 'T', bullets: ['a'] } }, vars)
    expect(out).toBe(JSON.stringify({ title: 'T', bullets: ['a'] }, null, 2))
  })

  it('handles multiple variables in one template', () => {
    const out = fillTemplate('{{topic}}: {{source}}', { topic: 'A', source: 'B' }, vars)
    expect(out).toBe('A: B')
  })

  it('trims whitespace inside braces', () => {
    const out = fillTemplate('{{ topic }}', { topic: 'X' }, vars)
    expect(out).toBe('X')
  })

  it('throws on undeclared variable', () => {
    expect(() => fillTemplate('{{unknown}}', {}, vars))
      .toThrowError(/未声明变量/)
  })

  it('throws when caller omits a variable', () => {
    expect(() => fillTemplate('{{topic}}', {}, vars))
      .toThrowError(/缺值/)
  })

  it('leaves literal text untouched', () => {
    const out = fillTemplate('plain text', { topic: 'A' }, vars)
    expect(out).toBe('plain text')
  })

  it('does not match single braces', () => {
    const out = fillTemplate('{topic}', { topic: 'A' }, vars)
    expect(out).toBe('{topic}')
  })

  it('supports dotted names (object paths)', () => {
    const nested = [
      { name: 'globalStyle.primaryColor', description: '主色', type: 'string' as const },
    ]
    const out = fillTemplate('{{globalStyle.primaryColor}}', { 'globalStyle.primaryColor': '#1677ff' }, nested)
    expect(out).toBe('#1677ff')
  })
})
