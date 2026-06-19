import { Modal, Input } from 'antd'
import { useState } from 'react'

export function NewProjectModal({ open, onCancel, onCreate }: {
  open: boolean
  onCancel: () => void
  onCreate: (topic: string) => Promise<void> | void
}) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <Modal title="新建项目" open={open} onCancel={onCancel} confirmLoading={loading}
           okButtonProps={{ disabled: !topic.trim() }}
           onOk={async () => {
             setLoading(true)
             try { await onCreate(topic.trim()) } finally { setLoading(false) }
           }}>
      <Input placeholder="主题，如：2026 产品路线图" value={topic}
             onChange={e => setTopic(e.target.value)}
             onPressEnter={async () => { if (topic.trim()) { setLoading(true); try { await onCreate(topic.trim()) } finally { setLoading(false) } } }} />
    </Modal>
  )
}
