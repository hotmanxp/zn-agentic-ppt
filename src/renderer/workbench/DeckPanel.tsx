import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle, SpinnerGap } from '@phosphor-icons/react'
import { App as AntdApp } from 'antd'
import { useWorkbenchStore } from '../stores/workbench.js'
import { usePptGenerationStore } from '../stores/pptGeneration.js'
import { api } from '../lib/api.js'
import { SlidePreview } from '../components/SlidePreview.js'

export function DeckPanel({
  onOpenSource,
}: {
  onOpenSource: () => void
}) {
  const slides = usePptGenerationStore((s) => s.slides)
  const selected = useWorkbenchStore((s) => s.selectedSlide)
  const setSelectedSlide = useWorkbenchStore((s) => s.setSelectedSlide)
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId)
  const setToast = useWorkbenchStore((s) => s.setToast)
  const { message, modal } = AntdApp.useApp()

  const ordered = Object.values(slides).sort((a, b) => {
    if (a.layout && b.layout) return a.layout - b.layout
    return String(a.id).localeCompare(String(b.id))
  })
  const safeIdx = Math.min(Math.max(0, selected), Math.max(0, ordered.length - 1))
  const current = ordered[safeIdx] ?? ordered[0]

  if (!current) {
    return (
      <div className="artifact-panel-body deck-panel">
        <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>
          暂无已生成的页面。
        </div>
      </div>
    )
  }

  const slideForPreview = {
    id: current.id,
    title: current.title,
    status: current.status === 'done' ? 'done' as const : 'failed' as const,
    html: current.html ?? '',
    layout: current.layout ?? 1,
    error: current.error,
  }

  const handleRegenerate = async () => {
    if (!activeProjectId) return
    modal.confirm({
      title: `重新生成第 ${safeIdx + 1} 页？`,
      content: `「${current.title}」 将被重新生成。`,
      okText: '重新生成',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.stage.slideRegenerate(activeProjectId, current.id)
          message.success('已重新生成')
          setToast('本页已重新生成')
        } catch (e) {
          message.error(`生成失败：${e instanceof Error ? e.message : String(e)}`)
        }
      },
    })
  }

  return (
    <div className="artifact-panel-body deck-panel">
      <div className="slide-stage">
        <SlidePreview slide={slideForPreview} />
      </div>
      <div className="slide-navigation">
        <button
          aria-label="上一页"
          disabled={safeIdx === 0}
          onClick={() => setSelectedSlide(safeIdx - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <span>第 {safeIdx + 1} 页 / {ordered.length}</span>
        <button
          aria-label="下一页"
          disabled={safeIdx >= ordered.length - 1}
          onClick={() => setSelectedSlide(safeIdx + 1)}
        >
          <ArrowRight size={16} />
        </button>
        <button
          className="primary-action"
          style={{ marginLeft: 'auto', height: 32, padding: '0 10px', fontSize: 12 }}
          onClick={handleRegenerate}
          disabled={current.status === 'generating'}
        >
          {current.status === 'generating' ? <SpinnerGap size={13} /> : null}
          重新生成此页
        </button>
      </div>
      <div className="citation-strip">
        <div>
          <CheckCircle size={18} weight="fill" />
          <span>
            <b>本页为 AI 生成</b>
            <small>生成时间 {current.durationMs ?? 0} ms · {current.layout ?? 1} 号布局</small>
          </span>
        </div>
        <button onClick={onOpenSource}>
          查看原文 <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="thumbnail-strip">
        {ordered.map((s, i) => (
          <button
            className={i === safeIdx ? 'is-active' : ''}
            key={s.id}
            onClick={() => setSelectedSlide(i)}
            aria-label={`查看第 ${i + 1} 页`}
          >
            <span>{i + 1}</span>
            <b>{s.title || `第 ${i + 1} 页`}</b>
          </button>
        ))}
      </div>
    </div>
  )
}