import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Input, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { useProjectDetailStore } from '../stores/projectDetail'
import { useBriefOptimizeStore } from '../stores/briefOptimize'
import { ProjectBriefForm } from '../components/ProjectBriefForm'
import { AskUserQuestionModal } from '../components/AskUserQuestionModal'
import type { ProjectBrief } from '@shared/types'

const { TextArea } = Input

const StageNavWithDirty = StageNav as unknown as React.FC<React.ComponentProps<typeof StageNav> & { dirty?: boolean }>

export function CollectEditor() {
  const { id = '' } = useParams()
  const { message } = AntdApp.useApp()
  const detail = useProjectDetailStore(s => s.detail)
  const patchDetail = useProjectDetailStore(s => s.patchDetail)

  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [brief, setBrief] = useState<ProjectBrief | null>(null)
  const [badge, setBadge] = useState<'empty' | 'optimized' | 'edited'>('empty')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [optimizing, setOptimizing] = useState(false)

  const phase = useBriefOptimizeStore(s => s.phase)
  const error = useBriefOptimizeStore(s => s.error)
  const startOptimize = useBriefOptimizeStore(s => s.start)
  const resetOptimize = useBriefOptimizeStore(s => s.reset)

  // Restore from detail on mount / project change
  useEffect(() => {
    if (detail?.id !== id) return
    if (detail.topic) setTopic(detail.topic)
    if (detail.source !== null) setSource(detail.source)
    if (detail.brief) {
      setBrief(detail.brief)
      setBadge('optimized')
    } else {
      setBrief(null)
      setBadge('empty')
    }
    setDirty(false)
  }, [detail?.id, id])

  // Track optimize phase
  useEffect(() => {
    if (phase === 'optimizing' || phase === 'asking') {
      setOptimizing(true)
    } else if (phase === 'done') {
      setOptimizing(false)
    } else if (phase === 'error') {
      setOptimizing(false)
      message.error(error ?? '优化失败')
      resetOptimize()
    } else if (phase === 'idle') {
      setOptimizing(false)
    }
  }, [phase, error, message, resetOptimize])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.stage.collectSave(id, topic, source)
      patchDetail({ source, topic, brief })
      setDirty(false)
      message.success('已保存')
    } catch (e: any) {
      message.error(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onOptimize = async () => {
    if (!source.trim()) {
      message.warning('请先在上方粘贴原始描述')
      return
    }
    setOptimizing(true)
    try {
      await startOptimize(id, brief)
    } catch (e: any) {
      message.error(e?.message ?? '启动优化失败')
      setOptimizing(false)
    }
  }

  // Wire onDone via direct API subscription so we capture the brief into form state
  useEffect(() => {
    const u = api.brief.onDone((e: any) => {
      setBrief(e.brief)
      setBadge('optimized')
      setDirty(true)
      patchDetail({ brief: e.brief })
    })
    return u
  }, [patchDetail])

  const onBriefChange = (b: ProjectBrief) => {
    setBrief(b)
    setBadge('edited')
    setDirty(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 1 步 · 项目信息</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>
          上方粘贴原始描述,下方填/优化结构化字段,下一步将基于结构化字段生成大纲。
        </p>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Input
            placeholder="项目主题"
            value={topic}
            onChange={e => { setTopic(e.target.value); setDirty(true) }}
            style={{ marginBottom: 12 }}
          />
          <TextArea
            rows={10}
            value={source}
            onChange={e => { setSource(e.target.value); setDirty(true) }}
            placeholder="把你的内容粘贴到这里...(供 Agent 优化使用,不会直接进大纲)"
            style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
          <small style={{ color: '#9ca3af' }}>本框内容仅供优化用,不会直接进大纲。</small>
        </div>

        <ProjectBriefForm value={brief} onChange={onBriefChange} badge={badge} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <small style={{ color: '#9ca3af' }}>字符数:{source.length}</small>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onSave} loading={saving} disabled={!dirty}>保存项目信息</Button>
            <Button type="primary" onClick={onOptimize} loading={optimizing} disabled={optimizing}>
              ✨ 优化
            </Button>
          </div>
        </div>
      </div>
      <StageNavWithDirty
        projectId={id}
        current="collect"
        canNext={source.trim().length > 0 && brief !== null && !optimizing}
        dirty={dirty}
        nextLabel="下一步:生成大纲"
      />
      <AskUserQuestionModal />
    </div>
  )
}