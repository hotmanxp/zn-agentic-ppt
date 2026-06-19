/**
 * Find and parse the first balanced JSON object in a string buffer.
 *
 * LLM responses often include markdown code fences, preamble text, and
 * postamble notes — sometimes containing literal `{`/`}` characters. A
 * naive greedy regex like `/\{[\s\S]*\}/` will over-match into the
 * trailing text and `JSON.parse` will then fail. This helper uses a
 * depth counter that ignores braces inside string values (including
 * escapes) to find the actual end of the first JSON object, then
 * validates the candidate parses cleanly before returning it.
 */
export function extractFirstJsonObject<T = unknown>(buffer: string): T {
  // Strip optional markdown ```json fences at the start/end of the buffer.
  const stripped = buffer
    .replace(/^```(?:json)?\s*\n/i, '')
    .replace(/\n```\s*$/, '')

  let depth = 0
  let start = -1
  let inString = false
  let escape = false

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      if (depth === 0) continue // stray close brace, ignore
      depth--
      if (depth === 0 && start !== -1) {
        const candidate = stripped.slice(start, i + 1)
        try {
          return JSON.parse(candidate) as T
        } catch {
          // Candidate didn't parse cleanly (e.g. it was a stray
          // `{word}` in the preamble). Reset and keep scanning.
          start = -1
        }
      }
    }
  }

  if (start === -1) {
    throw new Error('No JSON object found in buffer')
  }
  throw new Error('Unbalanced JSON in buffer')
}
