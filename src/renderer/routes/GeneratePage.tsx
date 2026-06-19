import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Progress, App as AntdApp } from 'antd'
import { ProjectStepper } from '../components/ProjectStepper'
import { SlideThumbnailStrip } from '../components/SlideThumbnailStrip'
import { SlidePreview } from '../components/SlidePreview'
import { usePptGenerationStore } from '../stores/pptGeneration'
import { useOutlineStore } from '../stores/outline'

export function GeneratePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const ppt = usePptGenerationStore()
  const outline = useOutlineStore(s => s.outline)
  const [started, setStarted] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)

  // Initialize slides from outline (if not already)
  useEffect(() => {
    if (outline && outline.slides.length > 0 && ppt.projectId !== id) {
      ppt.initialize(id, outline.slides.map(s => ({ id: s.id, title: s.title })))
      if (!currentId) setCurrentId(outline.slides[0].id)
    }
  }, [outline, id])

  // Auto-start on mount (kicks off LLM per slide via orchestrator)
  useEffect(() => {
    if (started) return
    if (!outline || outline.slides.length === 0) return
    setStarted(true)
    ppt.start(id)
  }, [outline, id, started])

  // Toast on phase transitions
  useEffect(() => {
    if (ppt.phase === 'done') {
      message.success(`完成 ${ppt.completed}/${ppt.total}`)
    } else if (ppt.phase === 'cancelled') {
      message.info('已取消')
    } else if (ppt.phase === 'error') {
      message.error('生成失败，请重试')
    }
  }, [ppt.phase])

  const onCancel = async () => {
    await ppt.cancel()
  }

  const onRegenerate = () => {
    setStarted(false)
    // schedule next tick: start() reads started flag
    setTimeout(() => setStarted(true), 0)
    ppt.reset()
    setTimeout(() => ppt.start(id), 0)
  }

  const slidesList = Object.values(ppt.slides)
  const isRunning = ppt.phase === 'running'
  const percent = ppt.total > 0 ? Math.round((ppt.completed / ppt.total) * 100) : 0
  const currentSlide = currentId ? slidesList.find(s => s.id === currentId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
        {/* Top bar: progress + cancel */}
        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
          <strong style={{ fontSize: 13 }}>第 3 步 · PPT 实时生成</strong>
          <Progress
            percent={percent}
            style={{ flex: 1, margin: 0 }}
            status={ppt.phase === 'error' ? 'exception' : (ppt.phase === 'cancelled' ? 'normal' : 'active')}
          />
          <small style={{ color: '#6b7280', minWidth: 80, textAlign: 'right' }}>
            {ppt.completed} / {ppt.total} {ppt.failed > 0 ? `(${ppt.failed} 失败)` : ''}
          </small>
          {isRunning
            ? <Button danger size="small" onClick={onCancel}>取消</Button>
            : <Button type="primary" size="small" onClick={onRegenerate}>{ppt.completed > 0 ? '重新生成' : '开始生成'}</Button>}
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <SlideThumbnailStrip
            slides={slidesList}
            currentId={currentId}
            onSelect={setCurrentId}
          />
          <SlidePreview slide={currentSlide ?? null} />
        </div>
      </div>
    </div>
  )
}
