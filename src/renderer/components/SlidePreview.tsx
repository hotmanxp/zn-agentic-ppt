import type { PptSlide } from '../stores/pptGeneration.js'

/**
 * Inline-render of one slide (no iframe).
 *
 * The slide's stored `html` is the LLM-written content (just a
 * <section>). We render it inside a styled "slide canvas" container
 * so it looks like a real PPT slide, regardless of how little the
 * LLM styled its own output.
 */

const CANVAS_STYLE: React.CSSProperties = {
  flex: 1,
  margin: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #4c1d95 100%)',
  borderRadius: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  overflow: 'hidden',
  position: 'relative',
}

const SLIDE_BG: React.CSSProperties = {
  width: 'min(960px, 100%)',
  aspectRatio: '16 / 9',
  background: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  padding: '48px 64px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  overflow: 'auto',
  color: '#1f2937',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
}

/**
 * Inject a robust style block so the LLM's plain <h1>/<ul>/<li>
 * markup looks polished. We scope styles to `.slide-canvas-NN` to
 * avoid leaking into the host page.
 */
const STYLE_BLOCK = `
  .slide-canvas h1 { font-size: 44px; font-weight: 800; color: #0f172a; margin: 0 0 8px; line-height: 1.2; letter-spacing: -0.02em; }
  .slide-canvas h2 { font-size: 32px; font-weight: 700; color: #1e293b; margin: 0 0 16px; }
  .slide-canvas h3 { font-size: 22px; font-weight: 600; color: #334155; margin: 0 0 12px; }
  .slide-canvas p  { font-size: 18px; line-height: 1.7; color: #334155; margin: 0 0 16px; }
  .slide-canvas ul, .slide-canvas ol { font-size: 20px; line-height: 1.7; padding-left: 28px; margin: 8px 0 16px; color: #1f2937; }
  .slide-canvas li { margin: 8px 0; }
  .slide-canvas li::marker { color: #6366f1; }
  .slide-canvas strong { color: #4338ca; font-weight: 700; }
  .slide-canvas em { color: #475569; font-style: italic; }
  .slide-canvas code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SF Mono', Monaco, monospace; }
  .slide-canvas pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 6px; font-size: 14px; overflow: auto; }
  .slide-canvas section { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
  .slide-canvas .skel-bullet, .slide-canvas .skel-notes { display: none; }
  .slide-canvas .slide-title { font-size: 44px; font-weight: 800; color: #0f172a; margin: 0 0 24px; }
  .slide-canvas .slide-bullets, .slide-canvas ul.slide-bullets { list-style: disc; padding-left: 28px; }
  .slide-canvas .slide-bullets li, .slide-canvas ul.slide-bullets li { font-size: 22px; line-height: 1.6; margin: 10px 0; }
  .slide-canvas .notes, .slide-canvas aside.notes { display: block; margin-top: 20px; font-size: 14px; color: #94a3b8; font-style: italic; }
`

let styleInjected = false
function ensureStyleInjected() {
  if (styleInjected) return
  styleInjected = true
  if (typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = STYLE_BLOCK
  document.head.appendChild(style)
}

export interface SlidePreviewProps {
  slide: PptSlide | null
}

export function SlidePreview({ slide }: SlidePreviewProps) {
  ensureStyleInjected()

  if (!slide) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={{ color: '#94a3b8', fontSize: 14 }}>选择左侧幻灯片预览</div>
      </div>
    )
  }

  if (slide.status === 'failed') {
    return (
      <div style={CANVAS_STYLE}>
        <div style={{ color: '#fca5a5', fontSize: 14, textAlign: 'center', padding: 24 }}>
          生成失败: {slide.error ?? '未知错误'}
        </div>
      </div>
    )
  }

  if (!slide.html || slide.status === 'layout' || slide.status === 'pending') {
    return (
      <div style={CANVAS_STYLE}>
        <div style={SLIDE_BG}>
          <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
            {slide.status === 'layout' ? '布局占位 — 等待 AI 填充…' : '等待生成…'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={CANVAS_STYLE}>
      <div className="slide-canvas" style={SLIDE_BG}>
        <div dangerouslySetInnerHTML={{ __html: slide.html }} />
      </div>
    </div>
  )
}
