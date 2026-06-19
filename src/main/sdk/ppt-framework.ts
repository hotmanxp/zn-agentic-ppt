import type { OutlineSlide } from '../../shared/types.js'

/**
 * Generates the framework index.html for a multi-slide PPT.
 *
 * The framework embeds a manifest of slides as JSON in a <script> tag
 * and uses fetch + DOM injection to assemble the rendered page at
 * load time. This lets individual slides be written/updated
 * independently by the orchestrator and re-rendered in place.
 */
export function generateFrameworkHtml(opts: {
  topic: string
  slides: Pick<OutlineSlide, 'id' | 'title'>[]
}): string {
  const manifest = opts.slides.map(s => ({ id: s.id, title: s.title }))
  return `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1280, initial-scale=1">
  <title>${escapeHtml(opts.topic)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #0b1020; color: #f5f7ff; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    #ppt-root { width: 100vw; min-height: 100vh; }
    #ppt-root > section { width: 100vw; min-height: 100vh; padding: 60px 80px; display: flex; flex-direction: column; justify-content: center; }
    h1, h2, h3 { color: #fff; }
    h1 { font-size: 56px; margin: 0 0 24px; }
    h2 { font-size: 40px; margin: 0 0 20px; }
    ul { font-size: 24px; line-height: 1.6; }
    li { margin: 8px 0; }
    .slide-meta { color: #94a3b8; font-size: 14px; margin-top: 24px; }
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
      for (const { id, title } of manifest) {
        if (filter && filter !== id) continue;
        try {
          const res = await fetch('slides/' + id + '.html', { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const html = await res.text();
          const wrap = document.createElement('section');
          wrap.dataset.id = id;
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
`
}

export function buildSlidePrompt(
  target: OutlineSlide,
  others: Pick<OutlineSlide, 'id' | 'title'>[],
  style?: unknown,
): string {
  return `你是 PPT 单页编辑。用户要为一页 PPT 生成 HTML 内容。

【目标页内容】(必须写入 slides/${target.id}.html)
标题: ${target.title}
要点:
${(target.bullets ?? []).map((b, i) => `  ${i + 1}. ${b}`).join('\n')}
${target.notes ? `备注: ${target.notes}` : ''}

【其他页标题参考】(保持整体连贯性)
${others.map(o => `- ${o.title}`).join('\n')}

${style ? `【样式参数】\n${JSON.stringify(style, null, 2)}\n` : ''}【任务】
1. 用 Read 工具读取 slides/${target.id}.html（已存在空模板）
2. 用 Write 工具将整个文件覆盖为该页的 HTML section：
   <section data-id="${target.id}">
     <h1>${target.title}</h1>
     <ul>
       <li>...要点 1...</li>
       <li>...要点 2...</li>
       ...
     </ul>
   </section>
3. 完成后回复 "done"

只输出 <section> 片段，不要包含 <html>/<head>/<body>。
使用语义化 class（h1/h2/ul/li/p）。不要写 <style> 或 <script>。`
}

/**
 * Generates a layout-only HTML section for a slide from its outline.
 * No LLM call — uses title + bullet count to produce a placeholder
 * skeleton that the user sees immediately. Per-bullet placeholders
 * are rendered as antd Skeleton-style gray bars (pure CSS, no JS).
 */
export function generateLayoutHtml(slide: OutlineSlide): string {
  const bullets = slide.bullets?.length ? slide.bullets : Array(Math.max(2, 1)).fill('')
  const bulletHtml = bullets.map(() => `
    <li class="skel-bullet"></li>`).join('')
  return `<section data-id="${slide.id}" data-status="layout">
  <div class="slide-title">${escapeHtml(slide.title || '未命名')}</div>
  <ul class="slide-bullets">${bulletHtml}
  </ul>
  <div class="slide-notes skel-notes"></div>
</section>`
}

export function generateLayoutStyles(): string {
  return `
    .slide-title { font-size: 36px; font-weight: 700; color: #f5f7ff; margin: 0 0 24px; }
    .slide-bullets { list-style: none; padding: 0; margin: 0; }
    .slide-bullets li.skel-bullet {
      height: 16px; width: 80%; margin: 14px 0;
      background: linear-gradient(90deg, #1f2a44 0%, #2a3658 50%, #1f2a44 100%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skel-pulse 1.4s ease-in-out infinite;
    }
    .slide-bullets li.skel-bullet:nth-child(2) { width: 65%; }
    .slide-bullets li.skel-bullet:nth-child(3) { width: 72%; }
    .slide-bullets li.skel-bullet:nth-child(4) { width: 55%; }
    .slide-notes.skel-notes {
      height: 12px; width: 50%; margin-top: 32px;
      background: linear-gradient(90deg, #1f2a44 0%, #2a3658 50%, #1f2a44 100%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skel-pulse 1.4s ease-in-out infinite;
    }
    @keyframes skel-pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  `
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeJson(s: unknown): string {
  // Avoid </script> in the manifest; escape forward slashes in strings only.
  const raw = JSON.stringify(s)
  return raw.replace(/<\/(script)/gi, '<\\/$1')
}
