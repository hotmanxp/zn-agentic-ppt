import type { ProjectBrief } from './types.js'

export function computePageCountEst(durationMinutes: number): number {
  return Math.max(3, Math.min(60, Math.round(durationMinutes / 1.5)))
}

export class BriefParseError extends Error {
  code = 'PARSE' as const
  constructor(message: string) { super(message); this.name = 'BriefParseError' }
}

export function validateBrief(raw: unknown): ProjectBrief {
  const r = raw as Partial<ProjectBrief>
  if (typeof r.name !== 'string' || !r.name.trim()) throw new BriefParseError('brief.name 缺失')
  if (typeof r.audience !== 'string') throw new BriefParseError('brief.audience 缺失')
  if (typeof r.durationMinutes !== 'number' || r.durationMinutes < 1 || r.durationMinutes > 120) {
    throw new BriefParseError('brief.durationMinutes 必须是 1-120 的整数')
  }
  if (typeof r.content !== 'string' || !r.content.trim()) throw new BriefParseError('brief.content 缺失')
  if (typeof r.style !== 'string') throw new BriefParseError('brief.style 缺失')
  return {
    name: r.name.trim().slice(0, 30),
    audience: r.audience.trim().slice(0, 80),
    durationMinutes: Math.round(r.durationMinutes),
    pageCountEst: computePageCountEst(r.durationMinutes),
    content: r.content.trim().slice(0, 800),
    style: r.style.trim().slice(0, 80),
  }
}
