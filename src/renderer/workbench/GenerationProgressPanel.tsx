import { SpinnerGap } from '@phosphor-icons/react'
import { usePptGenerationStore } from '../stores/pptGeneration.js'
import { GenerationThinkingPanel } from './GenerationThinkingPanel.js'
import { EXECUTION_STEPS } from './data/executionSteps.js'
import type { Brief } from './data/types.js'

/**
 * Right-side artifact panel content shown while the PPT is being generated.
 * Mirrors Conversation's GenerationCard so the user can see generation
 * progress without scrolling — and so the ArtifactPanel doesn't sit on top
 * of stale outline text while the deck is rendering.
 */
export function GenerationProgressPanel({ brief }: { brief: Brief }) {
  const total = usePptGenerationStore((s) => s.total)
  const completed = usePptGenerationStore((s) => s.completed)
  const failed = usePptGenerationStore((s) => s.failed)
  const phase = usePptGenerationStore((s) => s.phase)
  const slidesMap = usePptGenerationStore((s) => s.slides)

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const activeIndex = Math.min(EXECUTION_STEPS.length - 1, Math.floor(progress / 20))
  const slideEntries = Object.values(slidesMap)
  const complete = phase === 'done'

  return (
    <div className="artifact-progress" data-phase={phase}>
      <div className="generation-topline">
        <span className="run-icon"><SpinnerGap size={16} /></span>
        <div>
          <b>{complete ? '生成完成' : '正在生成 PPT'}</b>
          <small>
            {total > 0
              ? `${completed}/${total} 页完成${failed > 0 ? ` · ${failed} 失败` : ''}`
              : '等待首批页面就绪…'}
            {brief.pages ? ` · 目标 ${brief.pages} 页` : ''}
          </small>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <GenerationThinkingPanel
        steps={EXECUTION_STEPS}
        activeIndex={activeIndex}
        progress={progress}
        complete={complete}
      />
      {slideEntries.length > 0 && (
        <ol className="artifact-progress-slides" aria-label="逐页状态">
          {slideEntries.map((s, i) => (
            <li key={s.id} data-status={s.status}>
              <span className="slide-idx">{i + 1}</span>
              <span className="slide-title">{s.title || s.id}</span>
              <span className="slide-status">{labelForStatus(s.status)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function labelForStatus(s: string): string {
  if (s === 'done') return '已完成'
  if (s === 'failed') return '失败'
  if (s === 'generating' || s === 'layout') return '生成中'
  return '等待'
}