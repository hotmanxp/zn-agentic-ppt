import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { SlideList } from '../components/SlideList'
import { SlideEditor } from '../components/SlideEditor'
import { StageStreamBar } from '../components/StageStreamBar'
import { StyleControls } from '../components/StyleControls'
import { useOutlineStore } from '../stores/outline'
import { DEFAULT_STYLE, type OutlineSlide, type StyleSettings } from '@shared/types'

export function FineTunePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const { outline, updateSlide, saveStyle } = useOutlineStore()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE)
  const [streaming, setStreaming] = useState(false)
  const previewRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!outline) {
      api.project.get(id).then(p => {
        if (!p?.hasHtml) nav(`/projects/${id}/collect`)
      })
    } else if (!currentId && outline.slides[0]) {
      setCurrentId(outline.slides[0].id)
    }
  }, [outline, currentId, id, nav])

  // Load initial HTML
  useEffect(() => {
    if (id) {
      api.project.get(id).then(p => { if (p?.html) setHtml(p.html) })
    }
  }, [id])

  // Listen for slide updates
  useEffect(() => {
    const u = api.stage.onSlideUpdated(({ projectId, slideId, html }: any) => {
      if (projectId !== id) return
      setHtml(prev => prev ? spliceHtml(prev, slideId, html) : html)
      message.success('页面已更新')
    })
    return u
  }, [id, message])

  const onSlideChange = (patch: Partial<OutlineSlide>) => {
    if (!currentId) return
    setHtml(h => h)  // optimistic, will refresh on regen
    updateSlide(id, currentId, patch)
  }

  const onStyleChange = (patch: Partial<StyleSettings>) => {
    const next = { ...style, ...patch }
    setStyle(next)
    saveStyle(id, next)  // debounced in real impl
  }

  const current = outline?.slides.find(s => s.id === currentId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 1.2fr', background: '#f3f4f6', overflow: 'hidden' }}>
        <SlideList
          slides={outline?.slides ?? []}
          currentId={currentId}
          onSelect={setCurrentId}
        />
        <div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {current && (
            <SlideEditor
              slide={current}
              onChange={onSlideChange}
              onRegenerate={() => setStreaming(true)}
            />
          )}
          {streaming && currentId && (
            <div style={{ padding: '12px 20px' }}>
              <StageStreamBar
                kind="slide-regen"
                projectId={id}
                slideId={currentId}
                label="正在重生成该页…"
                onDone={() => {
                  setStreaming(false)
                  message.success('页面已更新')
                }}
              />
            </div>
          )}
          <div style={{ padding: '0 20px 20px' }}>
            <StyleControls style={style} onChange={onStyleChange} />
          </div>
        </div>
        <div style={{ background: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <small style={{ color: '#6b7280' }}>👁 预览</small>
          </div>
          <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
            <iframe ref={previewRef} srcDoc={html ?? ''} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} sandbox="allow-same-origin" />
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 24px', background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={() => nav(`/projects/${id}/outline`)}>← 返回大纲</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={async () => {
            if (!html) return
            const blob = new Blob([html], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `${outline?.slides[0]?.title ?? 'ppt'}.html`
            a.click(); URL.revokeObjectURL(url)
          }}>⬇ 导出 HTML</Button>
        </div>
      </div>
    </div>
  )
}

function spliceHtml(html: string, slideId: string, newSection: string): string {
  const re = new RegExp(
    `<section([^>]*)data-id=["']${slideId}["']([^>]*)>([\\s\\S]*?)</section>`,
    'i',
  )
  return re.test(html) ? html.replace(re, newSection) : html
}
