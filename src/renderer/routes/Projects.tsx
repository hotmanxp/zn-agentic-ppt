import { useEffect, useState } from 'react'
import { Button, Input, Select, Row, Col } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../stores/project'
import { ProjectCard } from '../components/ProjectCard'
import { NewProjectModal } from '../components/NewProjectModal'

export function Projects() {
  const { projects, load, create } = useProjectStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('updated-desc')

  useEffect(() => { load() }, [load])

  const filtered = projects
    .filter(p => !q || p.title.includes(q) || p.topic.includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>我的项目 <small style={{ color: '#6b7280', fontWeight: 400 }}>共 {projects.length} 个</small></h2>
        <Button type="primary" onClick={() => setOpen(true)}>+ 新建项目</Button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Input placeholder="🔍 搜索项目名..." style={{ maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} />
        <Select value={sort} onChange={setSort} options={[
          { value: 'updated-desc', label: '按修改时间 ↓' },
          { value: 'created-desc', label: '按创建时间 ↓' },
          { value: 'title-asc', label: '按名称 A→Z' },
        ]} />
      </div>
      <Row gutter={[20, 20]}>
        {filtered.map(p => <Col key={p.id} span={6}><ProjectCard project={p} /></Col>)}
        <Col span={6}>
          <div onClick={() => setOpen(true)} style={{ height: '100%', minHeight: 220, border: '2px dashed #d1d5db', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', cursor: 'pointer' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32 }}>+</div>
              <div>新建项目</div>
            </div>
          </div>
        </Col>
      </Row>
      <NewProjectModal open={open} onCancel={() => setOpen(false)} onCreate={async (topic) => {
        const m = await create(topic)
        setOpen(false)
        nav(`/projects/${m.id}`)
      }} />
    </div>
  )
}
