import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { OutlineCard } from '../components/OutlineCard'
import { StageStreamBar } from '../components/StageStreamBar'
import { useOutlineStore } from '../stores/outline'
import type { Outline, OutlineSlide } from '@shared/types'

export function OutlinePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const { outline, generate, updateSlide, addSlide, deleteSlide, setOutline } = useOutlineStore()
  const [localOutline, setLocalOutline] = useState<Outline | null>(outline)
  const [streaming, setStreaming] = useState(false)

  useEffect(() => { setLocalOutline(outline) }, [outline])

  // Load outline from disk on mount (and when projectId changes)
  useEffect(() => {
    let cancelled = false
    api.stage.outlineRead(id).then(o => {
      if (cancelled) return
      if (o) {
        setOutline(o.slides, o.generatedAt)
        setLocalOutline({ slides: o.slides, generatedAt: o.generatedAt })
      } else {
        api.project.get(id).then(p => {
          if (cancelled) return
          if (!p?.hasOutline) nav(`/projects/${id}/collect`)
        })
      }
    })
    return () => { cancelled = true }
  }, [id, nav])

  if (!localOutline) return null

  const onSlideChange = (slideId: string, patch: Partial<OutlineSlide>) => {
    setLocalOutline(o => o ? {
      ...o,
      slides: o.slides.map(s => s.id === slideId ? { ...s, ...patch } : s),
    } : o)
    // Debounced save
    setTimeout(() => updateSlide(id, slideId, patch), 500)
  }

  const onAdd = async () => {
    const o = await addSlide(id)
    setLocalOutline(o)
  }

  const onDelete = async (slideId: string) => {
    if (!confirm('删除该幻灯片？')) return
    const o = await deleteSlide(id, slideId)
    setLocalOutline(o)
  }

  const onNext = async () => {
    if (localOutline.slides.length === 0) { message.warning('至少需要一页'); return }
    nav(`/projects/${id}/generate`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 2 步 · 大纲编辑</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>编辑每页标题和要点。改完自动保存。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
          {localOutline.slides.map((s, i) => (
            <OutlineCard key={s.id} slide={s} index={i}
              onChange={p => onSlideChange(s.id, p)}
              onDelete={() => onDelete(s.id)} />
          ))}
        </div>
        <Button block type="dashed" onClick={onAdd} style={{ marginBottom: 16 }}>+ 添加新页</Button>
      </div>
      <StageNav
        projectId={id}
        current="outline"
        canNext={localOutline.slides.length > 0}
        onNext={onNext}
        nextLabel="下一步：生成 PPT"
      />
      <div style={{ position: 'absolute', top: 100, right: 32, width: 360 }}>
        {streaming ? (
          <StageStreamBar
            kind="outline"
            projectId={id}
            onDone={(r) => {
              setLocalOutline({ slides: r.slides ?? [], generatedAt: Date.now() })
              setStreaming(false)
            }}
          />
        ) : (
          <Button onClick={() => setStreaming(true)}>↻ 重新生成大纲</Button>
        )}
      </div>
    </div>
  )
}
