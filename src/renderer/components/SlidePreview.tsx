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
  background: '#ffffff', // overridden by .layout-N class
  borderRadius: 12,
  boxShadow: '0 20px 60px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.08)',
  padding: '56px 72px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  overflow: 'hidden',
  position: 'relative',
  color: '#0f172a',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
}

/**
 * Inject a robust style block so the LLM's plain <h1>/<ul>/<li>
 * markup looks polished. We scope styles to `.slide-canvas` to
 * avoid leaking into the host page. Inline styles written by the
 * LLM still take precedence (higher specificity than element selectors).
 */
const STYLE_BLOCK = `
  .slide-canvas { counter-reset: bullet; }
  .slide-canvas h1 {
    font-size: 56px; font-weight: 900; line-height: 1.05; margin: 0 0 8px;
    background: linear-gradient(135deg, #FF8839 0%, #FFB070 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    letter-spacing: -0.025em;
  }
  .slide-canvas h1::after {
    content: ""; display: block; width: 56px; height: 4px; margin-top: 14px;
    background: linear-gradient(90deg, #FF8839, #FFB070); border-radius: 2px;
  }
  .slide-canvas h2 { font-size: 30px; font-weight: 700; color: #1e293b; margin: 0 0 14px; }
  .slide-canvas h3 { font-size: 22px; font-weight: 600; color: #334155; margin: 0 0 10px; }
  .slide-canvas p  { font-size: 18px; line-height: 1.7; color: #334155; margin: 12px 0; }
  .slide-canvas h1 + ul, .slide-canvas h1 + ol { margin-top: 28px !important; }
  .slide-canvas ul, .slide-canvas ol {
    list-style: none; padding: 0; margin: 24px 0;
    display: grid; gap: 12px;
  }
  .slide-canvas li {
    font-size: 19px; line-height: 1.55; color: #1f2937;
    padding: 16px 18px 16px 58px; position: relative;
    background: #ffffff;
    border: 1px solid #e2e8f0; border-radius: 12px;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04);
  }
  .slide-canvas li::before {
    counter-increment: bullet;
    content: counter(bullet, decimal-leading-zero);
    position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
    font-size: 20px; font-weight: 800;
    background: linear-gradient(135deg, #FF8839, #FFB070);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    font-variant-numeric: tabular-nums;
  }
  .slide-canvas strong { color: #4338ca; font-weight: 700; }
  .slide-canvas em { color: #475569; font-style: italic; }
  .slide-canvas code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SF Mono', Monaco, monospace; }
  .slide-canvas pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 6px; font-size: 14px; overflow: auto; }
  .slide-canvas section { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
  .slide-canvas .skel-bullet, .slide-canvas .skel-notes { display: none; }
  .slide-canvas .slide-title, .slide-canvas div.slide-title {
    font-size: 56px; font-weight: 900; line-height: 1.05; margin: 0 0 8px;
    background: linear-gradient(135deg, #FF8839 0%, #FFB070 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .slide-canvas .slide-bullets, .slide-canvas ul.slide-bullets { list-style: none; padding: 0; }
  .slide-canvas .slide-bullets li, .slide-canvas ul.slide-bullets li {
    font-size: 19px; line-height: 1.55;
    padding: 16px 18px 16px 58px;
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
    position: relative;
  }
  .slide-canvas .slide-bullets li::before, .slide-canvas ul.slide-bullets li::before {
    counter-increment: bullet; content: counter(bullet, decimal-leading-zero);
    position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
    font-size: 20px; font-weight: 800;
    background: linear-gradient(135deg, #FF8839, #FFB070);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .slide-canvas .slide-notes, .slide-canvas .notes, .slide-canvas aside.notes, .slide-canvas p.slide-notes, .slide-canvas div.slide-notes {
    margin-top: 24px; padding: 12px 16px;
    background: rgba(99,102,241,0.08);
    border-left: 3px solid #6366f1; border-radius: 6px;
    font-size: 14px; color: #475569; font-style: italic;
  }

  /* ── Per-layout visual variants (cycled across deck) ──────────────── */
  /* Each layout uses a distinct visual identity (color, type, decoration)
     per the frontend-slides skill: "avoid generic purple-gradient template
     decks". layout-1 dark hero · layout-2 warm cards · layout-3 split panels
     · layout-4 dark neon stats · layout-5 vintage paper quote. */

  /* === layout-1: dark blue hero with orange/pink radial orbs === */
  .slide-canvas.layout-1 {
    background: radial-gradient(ellipse at 30% 20%, #1e3a8a 0%, #0b1020 60%) !important;
    color: #fff;
  }
  .slide-canvas.layout-1 section { align-items: center; text-align: center; position: relative; overflow: hidden; }
  .slide-canvas.layout-1 section::before {
    content: ""; position: absolute; top: -80px; right: -80px; width: 280px; height: 280px;
    background: radial-gradient(circle, #f59e0b 0%, transparent 70%); border-radius: 50%; opacity: 0.4;
  }
  .slide-canvas.layout-1 section::after {
    content: ""; position: absolute; bottom: -100px; left: -100px; width: 320px; height: 320px;
    background: radial-gradient(circle, #ec4899 0%, transparent 70%); border-radius: 50%; opacity: 0.4;
  }
  .slide-canvas.layout-1 h1, .slide-canvas.layout-1 .slide-title, .slide-canvas.layout-1 div.slide-title {
    font-size: 60px !important; font-weight: 900 !important; color: #fff !important;
    line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.02em; position: relative; z-index: 1;
  }
  .slide-canvas.layout-1 h1::before {
    content: "CHAPTER"; display: block; font-size: 12px; font-weight: 700;
    color: #f59e0b; letter-spacing: 6px; text-transform: uppercase; margin-bottom: 16px;
  }
  .slide-canvas.layout-1 h1::after {
    content: ""; display: block; width: 80px; height: 4px; margin: 20px auto 0;
    background: linear-gradient(90deg, #f59e0b, #ec4899); border-radius: 2px;
  }
  .slide-canvas.layout-1 ul, .slide-canvas.layout-1 ol { display: none; }
  .slide-canvas.layout-1 p, .slide-canvas.layout-1 .slide-notes, .slide-canvas.layout-1 p.slide-notes {
    font-size: 16px; color: rgba(255,255,255,0.75); margin-top: 12px; max-width: 600px;
    position: relative; z-index: 1;
  }

  /* === layout-2: warm cream cards with chocolate text + orange circles === */
  .slide-canvas.layout-2 {
    background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%) !important;
    color: #431407;
  }
  .slide-canvas.layout-2 h1, .slide-canvas.layout-2 .slide-title, .slide-canvas.layout-2 div.slide-title {
    font-size: 38px !important; font-weight: 800 !important; color: #7c2d12 !important;
    line-height: 1.15; margin: 0 0 20px;
  }
  .slide-canvas.layout-2 h1::before {
    content: "01 / "; color: #ea580c; font-weight: 700; font-size: 22px; vertical-align: middle;
    margin-right: 6px;
  }
  .slide-canvas.layout-2 ul, .slide-canvas.layout-2 ol, .slide-canvas.layout-2 .slide-bullets {
    list-style: none; padding: 0; margin: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;
  }
  .slide-canvas.layout-2 li, .slide-canvas.layout-2 .slide-bullets li {
    background: #fff; padding: 18px 18px 18px 56px; border-radius: 12px;
    box-shadow: 0 4px 12px rgba(124,45,18,0.08);
    font-size: 15px; line-height: 1.5; color: #431407; position: relative;
    border-top: 4px solid #ea580c;
  }
  .slide-canvas.layout-2 li::before {
    counter-increment: bullet; content: counter(bullet);
    position: absolute; left: 16px; top: 20px;
    width: 28px; height: 28px; border-radius: 50%;
    background: #ea580c; color: #fff; font-weight: 800; font-size: 13px;
    display: flex; align-items: center; justify-content: center;
  }
  .slide-canvas.layout-2 .slide-notes, .slide-canvas.layout-2 p.slide-notes { display: none; }

  /* === layout-3: split warm-red vs cold-blue panels === */
  .slide-canvas.layout-3 { background: #0f172a !important; color: #fff; padding: 0 !important; }
  .slide-canvas.layout-3 h1, .slide-canvas.layout-3 .slide-title, .slide-canvas.layout-3 div.slide-title {
    position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
    font-size: 28px !important; font-weight: 800 !important; color: #fff !important;
    margin: 0; z-index: 3; letter-spacing: 0.02em;
  }
  .slide-canvas.layout-3 h1::after {
    content: ""; display: block; width: 40px; height: 3px; margin: 10px auto 0;
    background: linear-gradient(90deg, #fdba74, #93c5fd); border-radius: 2px;
  }
  .slide-canvas.layout-3 section {
    flex-direction: row !important; align-items: stretch !important; height: 100%;
    position: relative; padding-top: 70px;
  }
  .slide-canvas.layout-3 ul, .slide-canvas.layout-3 ol { list-style: none; padding: 0; margin: 0; }
  .slide-canvas.layout-3 li {
    padding: 8px 0 8px 22px; position: relative;
    font-size: 15px; line-height: 1.5;
    border-bottom: 1px solid rgba(255,255,255,0.12);
  }
  .slide-canvas.layout-3 li:last-child { border-bottom: none; }
  .slide-canvas.layout-3 .slide-notes, .slide-canvas.layout-3 p.slide-notes { display: none; }

  /* === layout-4: dark stats with neon glow numbers === */
  .slide-canvas.layout-4 { background: #020617 !important; color: #fff; }
  .slide-canvas.layout-4 h1, .slide-canvas.layout-4 .slide-title, .slide-canvas.layout-4 div.slide-title {
    font-size: 22px !important; font-weight: 700 !important; color: rgba(255,255,255,0.55) !important;
    margin: 0 0 18px; text-transform: uppercase; letter-spacing: 5px;
  }
  .slide-canvas.layout-4 h1::after { display: none; }
  .slide-canvas.layout-4 ul, .slide-canvas.layout-4 ol, .slide-canvas.layout-4 .slide-bullets {
    list-style: none; padding: 0; margin: 0;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
  }
  .slide-canvas.layout-4 li, .slide-canvas.layout-4 .slide-bullets li {
    text-align: center; padding: 28px 12px;
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%);
    border-top: 2px solid; border-radius: 8px;
    font-size: 14px; line-height: 1.4; color: rgba(255,255,255,0.7);
    display: flex; flex-direction: column; gap: 8px;
  }
  .slide-canvas.layout-4 li::before, .slide-canvas.layout-4 .slide-bullets li::before { content: none; }
  .slide-canvas.layout-4 li:nth-child(1) { border-color: #10b981; }
  .slide-canvas.layout-4 li:nth-child(2) { border-color: #f59e0b; }
  .slide-canvas.layout-4 li:nth-child(3) { border-color: #ef4444; }
  .slide-canvas.layout-4 .slide-notes, .slide-canvas.layout-4 p.slide-notes { display: none; }

  /* === layout-5: vintage paper with serif italic quote === */
  .slide-canvas.layout-5 {
    background: #fef3c7 !important; color: #451a03;
    font-family: Georgia, "Songti SC", "Times New Roman", serif;
  }
  .slide-canvas.layout-5 section { align-items: center; text-align: center; }
  .slide-canvas.layout-5 h1, .slide-canvas.layout-5 .slide-title, .slide-canvas.layout-5 div.slide-title {
    font-size: 40px !important; font-weight: 400 !important; font-style: italic; line-height: 1.35;
    color: #451a03 !important; margin: 0; max-width: 88%;
  }
  .slide-canvas.layout-5 h1::before {
    content: """; display: block; font-size: 90px; color: #b45309;
    line-height: 0.5; margin-bottom: 16px; font-family: Georgia, serif;
  }
  .slide-canvas.layout-5 h1::after { display: none; }
  .slide-canvas.layout-5 ul, .slide-canvas.layout-5 ol { display: none; }
  .slide-canvas.layout-5 p, .slide-canvas.layout-5 .slide-notes, .slide-canvas.layout-5 p.slide-notes {
    font-size: 16px; color: #78350f; margin-top: 28px;
    font-style: normal; letter-spacing: 0.1em;
  }
  .slide-canvas.layout-5 p::before { content: "— "; }
`

// HMR-safe style injection: every mount re-syncs the injected <style>
// node so edits to STYLE_BLOCK during dev mode take effect immediately.
// Uses a stable id so we replace in place rather than append duplicates.
const STYLE_ELEMENT_ID = 'zn-ppt-slide-canvas-styles'
function ensureStyleInjected() {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (el && el.textContent === STYLE_BLOCK) return
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ELEMENT_ID
    document.head.appendChild(el)
  }
  el.textContent = STYLE_BLOCK
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
      <div className="slide-canvas" style={SLIDE_BG} data-layout={slide.layout ?? 2}>
        <div className="layout-frame" dangerouslySetInnerHTML={{ __html: slide.html }} />
      </div>
    </div>
  )
}
