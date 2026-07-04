import { ArrowClockwise, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { usePptGenerationStore } from '../stores/pptGeneration.js'
import { useWorkbenchStore } from '../stores/workbench.js'
import { GenerationThinkingPanel } from './GenerationThinkingPanel.js'
import { EXECUTION_STEPS } from './data/executionSteps.js'
import type { Brief } from './data/types.js'
export function GenerationProgressPanel({ brief }: { brief: Brief }) {
  const total = usePptGenerationStore((s) => s.total)
  const completed = usePptGenerationStore((s) => s.completed)
  const failed = usePptGenerationStore((s) => s.failed)
  const phase = usePptGenerationStore((s) => s.phase)
  const lastError = usePptGenerationStore((s) => s.lastError)
  const projectId = usePptGenerationStore((s) => s.projectId)
  const slidesMap = usePptGenerationStore((s) => s.slides)
  const resetPpt = usePptGenerationStore((s) => s.reset)
  const approveOutline = useWorkbenchStore((s) => s.approveOutline)
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const activeIndex = Math.min(EXECUTION_STEPS.length - 1, Math.floor(progress / 20))
  const slideEntries = Object.values(slidesMap)
  const isDone = phase === 'done'
  const isError = phase === 'error'
  return (
    <div className="artifact-progress" data-phase={phase}>
      <div className="generation-topline">
        <span className="run-icon">{isError ? <WarningCircle size={16} weight="fill" /> : <SpinnerGap size={16} />}</span>
        <div>
          <b>{isError ? '生成失败' : isDone ? '生成完成' : '正在生成 PPT'}</b>
          <small>
            {isError
              ? `${failed || total} 页生成失败`
              : `${completed}/${total} 页完成${failed > 0 ? ` · ${failed} 失败` : ''}`}
            {!isError && brief.pages ? ` · 目标 ${brief.pages} 页` : ''}
          </small>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <GenerationThinkingPanel steps={EXECUTION_STEPS} activeIndex={activeIndex} progress={progress} complete={isDone || isError} />
      {isError && lastError && (
        <pre className="artifact-progress-error" role="alert">
          {lastError.split('\n').slice(0, 4).join('\n')}
        </pre>
      )}
      {isError && projectId && (
        <div className="artifact-progress-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => { resetPpt(); void approveOutline(projectId) }}
          >
            <ArrowClockwise size={14} /> 重新生成
          </button>
        </div>
      )}
      {slideEntries.length > 0 && (
        <ol className="artifact-progress-slides" aria-label="逐页状态">
          {slideEntries.map((s, i) => (
            <li key={`${i}-${s.id}`} data-status={s.status}>
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
