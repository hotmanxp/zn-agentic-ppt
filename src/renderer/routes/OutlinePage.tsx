import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, App as AntdApp } from 'antd'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { OutlineCard } from '../components/OutlineCard'
import { StageStreamBar } from '../components/StageStreamBar'
import { useOutlineStore } from '../stores/outline'
import { useProjectDetailStore } from '../stores/projectDetail'
import type { OutlineSlide } from '@shared/types'

// StageNav gains an optional `dirty` prop via the parallel stores track;
// widen the local type so the unsaved-changes prompt wires through cleanly.
const StageNavWithDirty = StageNav as unknown as React.FC<React.ComponentProps<typeof StageNav> & { dirty?: boolean }>

export function OutlinePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const { outline, updateSlide, addSlide, deleteSlide } = useOutlineStore()
  const detail = useProjectDetailStore(s => s.detail)

  const [localSlides, setLocalSlides] = useState<OutlineSlide[]>([])
  const [savedSlides, setSavedSlides] = useState<OutlineSlide[]>([])
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)

  // Sync from store
  useEffect(() => {
    if (outline?.slides) {
      setLocalSlides(outline.slides)
      setSavedSlides(outline.slides)
    } else if (detail?.structuredOutline?.slides) {
      setLocalSlides(detail.structuredOutline.slides)
      setSavedSlides(detail.structuredOutline.slides)
    }
  }, [outline, detail?.structuredOutline])

  const dirty = useMemo(() => {
    if (localSlides.length !== savedSlides.length) return true
    return localSlides.some((s, i) => {
      const saved = savedSlides[i]
      return !saved || s.id !== saved.id || s.title !== saved.title
        || JSON.stringify(s.bullets) !== JSON.stringify(saved.bullets)
    })
  }, [localSlides, savedSlides])

  const onSlideChange = (slideId: string, patch: Partial<OutlineSlide>) => {
    setLocalSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...patch } : s))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      for (let i = 0; i < localSlides.length; i++) {
        const cur = localSlides[i]
        const saved = savedSlides[i]
        if (!saved || cur.title !== saved.title || JSON.stringify(cur.bullets) !== JSON.stringify(saved.bullets)) {
          await updateSlide(id, cur.id, { title: cur.title, bullets: cur.bullets })
        }
      }
      setSavedSlides(localSlides)
      message.success('大纲已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onAdd = async () => {
    const o = await addSlide(id)
    setLocalSlides(o.slides)
    setSavedSlides(o.slides)
  }

  const onDelete = async (slideId: string) => {
    if (!confirm('删除该幻灯片？')) return
    const o = await deleteSlide(id, slideId)
    setLocalSlides(o.slides)
    setSavedSlides(o.slides)
  }

  const onNext = () => {
    nav(`/projects/${id}/generate`)
  }

  if (localSlides.length === 0 && !outline) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fff', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>第 2 步 · 大纲编辑</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>编辑每页标题和要点，点「保存大纲」写入磁盘。</p>
          </div>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!dirty}>
            保存大纲
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
          {localSlides.map((s, i) => (
            <OutlineCard key={s.id} slide={s} index={i}
              onChange={p => onSlideChange(s.id, p)}
              onDelete={() => onDelete(s.id)} />
          ))}
        </div>
        <Button block type="dashed" onClick={onAdd} style={{ marginBottom: 16 }}>+ 添加新页</Button>
      </div>
      <StageNavWithDirty
        projectId={id}
        current="outline"
        canNext={localSlides.length > 0}
        dirty={dirty}
        onNext={onNext}
        nextLabel="下一步：生成 PPT"
      />
      <div style={{ position: 'absolute', top: 100, right: 32, width: 360 }}>
        {streaming ? (
          <StageStreamBar
            kind="outline"
            projectId={id}
            onDone={(r) => {
              setLocalSlides(r.slides ?? [])
              setSavedSlides(r.slides ?? [])
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
