/**
 * Find and parse the first balanced JSON value in a string buffer.
 *
 * LLM responses often include markdown code fences (` ```json ... ``` `),
 * preamble text, and postamble notes — sometimes containing literal
 * `{`/`}` characters. A naive greedy regex like `/\{[\s\S]*\}/` will
 * over-match into the trailing text and `JSON.parse` will then fail.
 * This helper uses a depth counter that ignores braces/brackets inside
 * string values (including escapes) to find the actual end of the
 * first JSON value, then validates the candidate parses cleanly
 * before returning it.
 *
 * Picks object vs array based on the FIRST non-whitespace delimiter
 * so `[{"a":1}]` returns the array, not the inner object.
 */
export function extractFirstJsonValue<T = unknown>(buffer: string): T {
  // Strip optional markdown ```json fences at the start/end of the buffer.
  const stripped = buffer
    .replace(/^```(?:json)?\s*\n/i, '')
    .replace(/\n```\s*$/, '')
    .trim()

  // Detect whether the first non-whitespace opener is `{` or `[`.
  const firstDelim = stripped.match(/[\s\S]*?([\{\[])/)?.[1] ?? '{'

  const opener = firstDelim as '{' | '['
  const closer = opener === '{' ? '}' : ']'
  const result = scanFor(stripped, opener, closer)
  if (result !== undefined) return result as T

  // Fallback: try the other shape (in case buffer is malformed / mixed).
  const altOpener = opener === '{' ? '[' : '{'
  const altCloser = altOpener === '{' ? '}' : ']'
  const altResult = scanFor(stripped, altOpener, altCloser)
  if (altResult !== undefined) return altResult as T

  throw new Error('No JSON value found in buffer')
}

function scanFor(stripped: string, opener: string, closer: string): unknown | undefined {
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
    } else if (ch === opener) {
      if (depth === 0) start = i
      depth++
    } else if (ch === closer) {
      if (depth === 0) continue // stray close, ignore
      depth--
      if (depth === 0 && start !== -1) {
        const candidate = stripped.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch {
          // Candidate didn't parse cleanly (e.g. it was a stray
          // `{word}` in the preamble). Reset and keep scanning.
          start = -1
        }
      }
    }
  }

  if (start === -1) return undefined
  throw new Error(`Unbalanced JSON ${opener}${closer} in buffer`)
}

/** @deprecated use extractFirstJsonValue (handles both {} and []) */
export function extractFirstJsonObject<T = unknown>(buffer: string): T {
  const stripped = buffer
    .replace(/^```(?:json)?\s*\n/i, '')
    .replace(/\n```\s*$/, '')
    .trim()
  // Restrict to object-only scan for the deprecated alias to preserve
  // the original error message ("No JSON object found in buffer").
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      if (depth === 0) continue
      depth--
      if (depth === 0 && start !== -1) {
        const candidate = stripped.slice(start, i + 1)
        try { return JSON.parse(candidate) as T } catch { start = -1 }
      }
    }
  }
  if (start === -1) throw new Error('No JSON object found in buffer')
  throw new Error('Unbalanced JSON in buffer')
}
