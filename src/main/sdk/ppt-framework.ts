import type { OutlineSlide } from "../../shared/types.js";

/**
 * Generates the framework index.html for a multi-slide PPT.
 *
 * The framework embeds a manifest of slides as JSON in a <script> tag
 * and uses fetch + DOM injection to assemble the rendered page at
 * load time. This lets individual slides be written/updated
 * independently by the orchestrator and re-rendered in place.
 */
export function generateFrameworkHtml(opts: {
  topic: string;
  slides: (Pick<OutlineSlide, "id" | "title"> & { layout?: 1 | 2 | 3 | 4 | 5 })[];
}): string {
  const manifest = opts.slides.map((s) => ({ id: s.id, title: s.title, layout: s.layout ?? 1 }));
  return `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1280, initial-scale=1">
  <title>${escapeHtml(opts.topic)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100vh; background: linear-gradient(135deg,#0b1020 0%,#1e1b4b 100%); color: #f5f7ff; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    #ppt-root { width: 100vw; }
    /* Make ANY bare <section> look like a designed slide even when the LLM
       emitted just <h1>+<ul>. Decorative accent bar + gradient title +
       numbered glassmorphic cards apply automatically. */
    #ppt-root > section {
      width: 100vw; min-height: 100vh;
      padding: 80px 100px;
      display: flex; flex-direction: column; justify-content: center;
      position: relative; overflow: hidden;
    }
    #ppt-root > section::before {
      content: ""; position: absolute; left: 0; top: 80px; bottom: 80px; width: 6px;
      background: linear-gradient(180deg, #FF6600 0%, #FF8C42 100%);
      border-radius: 0 4px 4px 0;
    }
    #ppt-root > section::after {
      content: ""; position: absolute; top: -120px; right: -120px; width: 360px; height: 360px;
      background: radial-gradient(circle, rgba(114,46,209,0.35), transparent 70%);
      border-radius: 50%; pointer-events: none;
    }
    h1, h2, h3 { color: #fff; }
    h1 {
      font-size: 60px; font-weight: 800; margin: 0 0 12px; line-height: 1.1;
      background: linear-gradient(135deg, #FF6600 0%, #FF8C42 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      letter-spacing: -0.02em;
    }
    h1::after {
      content: ""; display: block; width: 60px; height: 4px; margin-top: 16px;
      background: linear-gradient(90deg, #FF6600, #FF8C42); border-radius: 2px;
    }
    h2 { font-size: 36px; font-weight: 700; margin: 0 0 16px; color: rgba(255,255,255,0.92); }
    h3 { font-size: 24px; font-weight: 600; margin: 0 0 12px; color: rgba(255,255,255,0.85); }
    p  { font-size: 20px; line-height: 1.7; color: rgba(255,255,255,0.82); margin: 12px 0; }
    h1 + ul, h1 + ol, h1 + div ul, h1 + div ol { margin-top: 32px !important; }
    ul, ol {
      list-style: none; padding: 0; margin: 24px 0;
      display: grid; gap: 14px; counter-reset: bullet;
    }
    li {
      font-size: 21px; line-height: 1.55;
      padding: 18px 22px 18px 64px;
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      position: relative;
      color: rgba(255,255,255,0.92);
    }
    li::before {
      counter-increment: bullet;
      content: counter(bullet, decimal-leading-zero);
      position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
      font-size: 22px; font-weight: 800;
      background: linear-gradient(135deg, #FF6600, #FF8C42);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      font-variant-numeric: tabular-nums;
    }
    .slide-meta, .slide-notes, p.slide-notes, .notes, aside.notes {
      margin-top: 32px; padding: 12px 18px;
      background: rgba(99,102,241,0.12);
      border-left: 3px solid #6366f1; border-radius: 6px;
      font-size: 15px; color: rgba(255,255,255,0.6); font-style: italic;
    }
    /* Honour inline styles the LLM writes — they win over defaults. */
    [style] { /* no-op selector; inline styles take precedence naturally */ }

    /* ── Per-layout visual variants ────────────────────────────────────── */
    /* Each layout has a distinct visual identity so the deck reads as
       five different slides, not five identical ones. */
    /* layout-1: deep-blue radial hero with orange/pink orbs */
    #ppt-root > section.layout-1 {
      background: radial-gradient(ellipse at 30% 20%,#1e3a8a 0%,#0b1020 60%) !important;
      color: #fff; text-align: center;
    }
    #ppt-root > section.layout-1::before { display: none; }
    #ppt-root > section.layout-1::after {
      content: ""; position: absolute; top: -100px; right: -100px; width: 320px; height: 320px;
      background: radial-gradient(circle,#f59e0b,transparent 70%); border-radius: 50%; opacity: 0.4;
    }
    /* layout-2: warm cream cards with orange number circles */
    #ppt-root > section.layout-2 {
      background: linear-gradient(135deg,#fff7ed 0%,#fed7aa 100%) !important;
      color: #431407;
    }
    #ppt-root > section.layout-2::before { display: none; }
    #ppt-root > section.layout-2::after { display: none; }
    /* layout-3: split warm-red vs cold-blue panels on dark bg */
    #ppt-root > section.layout-3 {
      background: #0f172a !important; color: #fff;
      padding: 0 !important;
    }
    #ppt-root > section.layout-3::before { display: none; }
    #ppt-root > section.layout-3::after { display: none; }
    /* layout-4: dark neon stats with green/amber/red glow */
    #ppt-root > section.layout-4 {
      background: #020617 !important; color: #fff;
    }
    #ppt-root > section.layout-4::before { display: none; }
    #ppt-root > section.layout-4::after { display: none; }
    /* layout-5: vintage cream paper with serif italic quote */
    #ppt-root > section.layout-5 {
      background: #fef3c7 !important; color: #451a03;
      font-family: Georgia, "Songti SC", "Times New Roman", serif;
    }
    #ppt-root > section.layout-5::before { display: none; }
    #ppt-root > section.layout-5::after { display: none; }
    ${generateLayoutStyles()}
  </style>
</head>
<body>
  <main id="ppt-root"></main>
  <script type="application/json" id="slides-manifest">${escapeJson(manifest)}</script>
  <script>
    (async () => {
      const root = document.getElementById('ppt-root');
      const manifest = JSON.parse(document.getElementById('slides-manifest').textContent);
      const params = new URLSearchParams(location.search);
      const filter = params.get('slide');
      for (const { id, title, layout } of manifest) {
        if (filter && filter !== id) continue;
        try {
          const res = await fetch('slides/' + id + '.html', { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const html = await res.text();
          const wrap = document.createElement('section');
          wrap.dataset.id = id;
          wrap.className = 'layout-' + (layout || 1);
          wrap.innerHTML = html;
          if (location.hash === '#' + id) {
            wrap.scrollIntoView();
          }
          root.appendChild(wrap);
        } catch (e) {
          const err = document.createElement('section');
          err.dataset.id = id;
          err.innerHTML = '<h2>' + title + '</h2><p style="color:#fca5a5">Slide not yet generated</p>';
          root.appendChild(err);
        }
      }
      if (location.hash) {
        const target = document.querySelector('[data-id="' + location.hash.slice(1) + '"]');
        if (target) target.scrollIntoView();
      }
    })();
  </script>
</body>
</html>
`;
}

/** Maps a slide's index (0-based) to one of 5 distinct layouts. */
export function layoutForIndex(index: number): 1 | 2 | 3 | 4 | 5 {
  return ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

/**
 * Generates a layout-only HTML section for a slide from its outline.
 * No LLM call — uses title + bullet count to produce a placeholder
 * skeleton that the user sees immediately. Per-bullet placeholders
 * are rendered as antd Skeleton-style gray bars (pure CSS, no JS).
 */
export function generateLayoutHtml(slide: OutlineSlide): string {
  return `<section data-id="${slide.id}"></section>`;
}

export function generateLayoutStyles(): string {
  return `
    li.skel-bullet {
      height: 16px; width: 80%; margin: 14px 0;
      background: linear-gradient(90deg, #1f2a44 0%, #2a3658 50%, #1f2a44 100%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skel-pulse 1.4s ease-in-out infinite;
      list-style: none;
    }
    li.skel-bullet:nth-child(2) { width: 65%; }
    li.skel-bullet:nth-child(3) { width: 72%; }
    li.skel-bullet:nth-child(4) { width: 55%; }
    p.slide-notes.skel-notes {
      height: 12px; width: 50%; margin-top: 32px;
      background: linear-gradient(90deg, #1f2a44 0%, #2a3658 50%, #1f2a44 100%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skel-pulse 1.4s ease-in-out infinite;
    }
    @keyframes skel-pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  `;
}

function escapeJson(s: unknown): string {
  // Avoid </script> in the manifest; escape forward slashes in strings only.
  const raw = JSON.stringify(s);
  return raw.replace(/<\/(script)/gi, "<\\/$1");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Re-exports for back-compat (deprecated; use src/main/sdk/prompts instead)
export { renderPrompt } from "./prompts/index.js";
export { LAYOUT_DIRECTIONS } from "./prompts/slide-user.js";
