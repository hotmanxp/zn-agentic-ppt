import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Input, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { StageStreamBar } from '../components/StageStreamBar'
import { useProjectDetailStore } from '../stores/projectDetail'
import { useOutlineStore } from '../stores/outline'

const { TextArea } = Input

// StageNav will gain an optional `dirty` prop in a parallel track; widen the
// type locally so the unsaved-changes prompt wires through cleanly here.
const StageNavWithDirty = StageNav as unknown as React.FC<React.ComponentProps<typeof StageNav> & { dirty?: boolean }>

export function CollectEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const detail = useProjectDetailStore(s => s.detail)
  const patchDetail = useProjectDetailStore(s => s.patchDetail)
  const setOutline = useOutlineStore(s => s.setOutline)

  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Restore from detail
  useEffect(() => {
    if (detail?.id === id) {
      if (detail.topic) setTopic(detail.topic)
      if (detail.source !== null) setSource(detail.source)
      setDirty(false)
    }
  }, [detail?.id, id])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.stage.collectSave(id, topic, source)
      patchDetail({ source, topic })
      setDirty(false)
      message.success('已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onNext = () => {
    setStreaming(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 1 步 · 内容收集</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>粘贴你的素材，下一步 LLM 会整理成 PPT 大纲。</p>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Input
            placeholder="项目主题"
            value={topic}
            onChange={e => { setTopic(e.target.value); setDirty(true) }}
            style={{ marginBottom: 12 }}
          />
          <TextArea
            rows={14}
            value={source}
            onChange={e => { setSource(e.target.value); setDirty(true) }}
            placeholder="把你的内容粘贴到这里..."
            style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {streaming ? (
            <StageStreamBar
              kind="outline"
              projectId={id}
              onDone={(r) => {
                setOutline(r.slides ?? [])
                nav(`/projects/${id}/outline`)
              }}
            />
          ) : (
            <>
              <small style={{ color: '#9ca3af' }}>字符数：{source.length} · 约 30 秒生成大纲</small>
              <Button type="primary" onClick={onSave} loading={saving} disabled={!dirty}>
                保存项目信息
              </Button>
            </>
          )}
        </div>
      </div>
      <StageNavWithDirty
        projectId={id}
        current="collect"
        canNext={source.trim().length > 0 && !streaming}
        dirty={dirty}
        onNext={onNext}
        nextLabel="下一步：生成大纲"
      />
    </div>
  )
}
