export function parseOutline(md: string): number {
  // Strip code fences first
  const stripped = md.replace(/```[\s\S]*?```/g, '')
  const matches = stripped.match(/^# .+$/gm)
  return matches ? matches.length : 0
}

export interface Slide {
  title: string
  body: string
}

export function splitIntoSlides(md: string): Slide[] {
  const stripped = md.replace(/```[\s\S]*?```/g, '')
  const lines = stripped.split('\n')
  const slides: Slide[] = []
  let current: Slide | null = null
  for (const line of lines) {
    const h1 = line.match(/^# (.+)$/)
    if (h1) {
      if (current) slides.push(current)
      current = { title: h1[1].trim(), body: '' }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current) slides.push(current)
  if (slides.length === 0) return [{ title: 'Slide 1', body: stripped.trim() }]
  return slides.map(s => ({ ...s, body: s.body.trim() }))
}
