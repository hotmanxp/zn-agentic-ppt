import { useEffect, useRef } from 'react'

export function HtmlStream({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [html])
  return (
    <div ref={ref} style={{
      background: '#f9fafb', borderRadius: 4, padding: 12,
      fontFamily: 'SF Mono, monospace', fontSize: 11, color: '#374151',
      maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap',
    }}>{html}</div>
  )
}
