import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Progress, App as AntdApp } from 'antd'
import { ProjectStepper } from '../components/ProjectStepper'
import { SlideThumbnailStrip } from '../components/SlideThumbnailStrip'
import { SlidePreview } from '../components/SlidePreview'
import { usePptGenerationStore } from '../stores/pptGeneration'
import { api } from '../lib/api.js'
import type { OutlineSlide } from '@shared/types'

export function GeneratePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message, modal } = AntdApp.useApp()
  const ppt = usePptGenerationStore()
  // Source of truth is the disk-persisted outline.json (read via IPC),
  // not the in-memory outline store. The store can drift if the user
  // re-enters the page without a full reload.
  const [diskSlides, setDiskSlides] = useState<OutlineSlide[]>([])
  const [loaded, setLoaded] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)

  // Load outline from disk on mount + whenever the project changes.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    api.stage.outlineRead(id).then(outline => {
      if (cancelled) return
      const slides = outline?.slides ?? []
      setDiskSlides(slides)
      setLoaded(true)
    }).catch(() => {
      if (!cancelled) setLoaded(true)
    })
    return () => { cancelled = true }
  }, [id])

  // Sync the ppt placeholder list whenever the disk outline changes.
  // If ppt.slides already matches the disk outline (same ids + count),
  // do nothing — preserves generation state across re-entries.
  useEffect(() => {
    if (!loaded || diskSlides.length === 0) return
    const outlineIds = new Set(diskSlides.map(s => s.id))
    const existingIds = Object.keys(ppt.slides)
    const sameSet =
      existingIds.length === diskSlides.length &&
      diskSlides.every(s => outlineIds.has(s.id))
    if (ppt.projectId !== id || !sameSet) {
      ppt.initialize(id, diskSlides.map(s => ({ id: s.id, title: s.title })))
    }
    if (!currentId || !outlineIds.has(currentId)) {
      setCurrentId(diskSlides[0].id)
    }
  }, [diskSlides, loaded, id])

  // Toast on phase transitions
  useEffect(() => {
    if (ppt.phase === 'done' && ppt.total > 0 && ppt.projectId === id) {
      message.success(`完成 ${ppt.completed}/${ppt.total}`)
    } else if (ppt.phase === 'cancelled') {
      message.info('已取消')
    } else if (ppt.phase === 'error') {
      message.error('生成失败，请重试')
    }
  }, [ppt.phase])

  const onRegenerate = () => {
    if (ppt.completed > 0 || ppt.failed > 0) {
      modal.confirm({
        title: '重新生成',
        content: `将覆盖已有 ${ppt.completed} 页成功 + ${ppt.failed} 页失败的生成结果，确认？`,
        okText: '确认重新生成',
        cancelText: '取消',
        onOk: () => {
          ppt.reset()
          ppt.start(id)
        },
      })
    } else {
      ppt.start(id)
    }
  }

  const onCancel = async () => {
    await ppt.cancel()
  }

  const slidesList = Object.values(ppt.slides)
  const isRunning = ppt.phase === 'running'
  const percent = ppt.total > 0 ? Math.round((ppt.completed / ppt.total) * 100) : 0
  const currentSlide = currentId ? slidesList.find(s => s.id === currentId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
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