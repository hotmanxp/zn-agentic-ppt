import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Progress, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { SlideThumbnailStrip } from '../components/SlideThumbnailStrip'
import { StyleControls } from '../components/StyleControls'
import { usePptGenerationStore } from '../stores/pptGeneration'
import { useOutlineStore } from '../stores/outline'
import { DEFAULT_STYLE, type StyleSettings } from '@shared/types'

export function FineTunePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const outline = useOutlineStore(s => s.outline)
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE)
  const [userDataPath, setUserDataPath] = useState<string>('')
  const previewRef = useRef<HTMLIFrameElement>(null)
  const pptGen = usePptGenerationStore()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    api.system.userDataPath().then(setUserDataPath)
  }, [])

  // Initialize the pptGeneration store from outline on mount / outline change
  useEffect(() => {
    if (outline && outline.slides.length > 0 && pptGen.projectId !== id) {
      pptGen.initialize(id, outline.slides.map(s => ({ id: s.id, title: s.title })))
      setCurrentId(outline.slides[0].id)
    }
  }, [outline, id])

  // Force iframe reload when a new slide becomes ready
  useEffect(() => {
    setIframeKey(k => k + 1)
  }, [pptGen.completed])

  // When user clicks a thumbnail, scroll the iframe to that slide via hash
  useEffect(() => {
    if (!currentId || !previewRef.current) return
    const w = previewRef.current.contentWindow
    if (w) w.location.hash = currentId
  }, [currentId, iframeKey])

  const onStart = async () => {
    if (!outline || outline.slides.length === 0) {
      message.warning('请先完成大纲')
      nav(`/projects/${id}/outline`)
      return
    }
    await pptGen.start(id)
    const phase = usePptGenerationStore.getState().phase
    if (phase === 'error') {
      message.error('生成失败，请重试')
    } else if (phase === 'done') {
      const c = usePptGenerationStore.getState().completed
      const t = usePptGenerationStore.getState().total
      message.success(`完成 ${c}/${t}`)
    } else if (phase === 'cancelled') {
      message.info(`已取消`)
    }
  }

  const onCancel = async () => {
    await pptGen.cancel()
  }

  const onStyleChange = (patch: Partial<StyleSettings>) => {
    const next = { ...style, ...patch }
    setStyle(next)
    useOutlineStore.getState().saveStyle(id, next)
  }

  const slidesList = Object.values(pptGen.slides)
  const isRunning = pptGen.phase === 'running'
  const iframeSrc = userDataPath
    ? `file://${userDataPath}/projects/${id}/index.html#${currentId ?? ''}`
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f3f4f6', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
          <strong style={{ fontSize: 13 }}>PPT 预览</strong>
          <Progress
            percent={pptGen.total > 0 ? Math.round((pptGen.completed / pptGen.total) * 100) : 0}
            style={{ flex: 1, margin: 0 }}
            status={pptGen.phase === 'error' ? 'exception' : (pptGen.phase === 'cancelled' ? 'normal' : 'active')}
          />
          <small style={{ color: '#6b7280', minWidth: 80, textAlign: 'right' }}>
            {pptGen.completed} / {pptGen.total} {pptGen.failed > 0 ? `(${pptGen.failed} 失败)` : ''}
          </small>
          {isRunning
            ? <Button danger size="small" onClick={onCancel}>取消</Button>
            : <Button type="primary" size="small" onClick={onStart}>{pptGen.completed > 0 ? '重新生成' : '开始生成'}</Button>}
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <SlideThumbnailStrip
            slides={slidesList}
            currentId={currentId}
            onSelect={setCurrentId}
          />

          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', background: '#0b1020', overflow: 'hidden' }}>
            {slidesList.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                暂无大纲。请先到「第 2 步」编辑大纲。
              </div>
            ) : iframeSrc ? (
              <iframe
                key={iframeKey}
                ref={previewRef}
                src={iframeSrc}
                style={{ flex: 1, width: '100%', height: '100%', border: 'none', background: '#0b1020' }}
                sandbox="allow-same-origin allow-scripts"
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                加载中…
              </div>
            )}
            {isRunning && (
              <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
                生成中 · {pptGen.completed} / {pptGen.total}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 12, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
          <StyleControls style={style} onChange={onStyleChange} />
        </div>
      </div>
    </div>
  )
}
