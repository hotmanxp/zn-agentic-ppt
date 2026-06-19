import { useState } from 'react'
import { Button } from 'antd'

export function HtmlPreview({ html }: { html: string | null }) {
  const [page, setPage] = useState(0)
  if (!html) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>暂无预览，点"生成 PPT"开始</div>
  }
  const slides = html.split(/<section[^>]*class="slide"/i).filter(Boolean)
  const current = slides[page] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <small style={{ color: '#6b7280' }}>👁 预览</small>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>◀</Button>
          <small>{page + 1} / {slides.length}</small>
          <Button size="small" onClick={() => setPage(p => Math.min(slides.length - 1, p + 1))} disabled={page >= slides.length - 1}>▶</Button>
        </div>
      </div>
      <iframe srcDoc={`<style>body{margin:0;font-family:sans-serif;background:#fff;}section.slide{aspect-ratio:16/9;padding:48px;display:flex;flex-direction:column;justify-content:center;}</style>${current}`}
              style={{ flex: 1, border: 'none', background: '#f3f4f6' }}
              sandbox="allow-same-origin" />
    </div>
  )
}
