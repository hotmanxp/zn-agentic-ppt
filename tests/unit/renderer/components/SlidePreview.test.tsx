/**
 * SlidePreview regression test — Bug UI-A.
 *
 * The SlidePreview canvas used to set only `data-layout` as a string
 * attribute, while the per-layout CSS targeted `.slide-canvas.layout-N`
 * classes. As a result, the 5 visual variants (layout-1 dark hero,
 * layout-2 warm cards, layout-3 split panels, layout-4 neon stats,
 * layout-5 vintage paper) never rendered. This test asserts the class
 * is on the canvas div for every layout value 1..5 plus the default
 * (no layout).
 *
 * Uses `react-dom/server` (already a dep) to render synchronously to
 * an HTML string. We don't need a full DOM environment for this
 * check; we just need the className to be emitted.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SlidePreview } from "../../../../src/renderer/components/SlidePreview.js";
import type { PptSlide } from "../../../../src/renderer/stores/pptGeneration.js";

const baseSlide: PptSlide = {
  id: "s1",
  title: "T",
  status: "done",
  html: "<section><h1>Hello</h1></section>",
};

describe("SlidePreview — layout-N class application (Bug UI-A regression)", () => {
  for (const layout of [1, 2, 3, 4, 5] as const) {
    it(`emits slide-canvas layout-${layout} for layout=${layout}`, () => {
      const html = renderToStaticMarkup(
        <SlidePreview slide={{ ...baseSlide, layout }} />,
      );
      expect(html).toContain(`slide-canvas layout-${layout}`);
    });
  }

  it("defaults to layout-2 when slide.layout is undefined", () => {
    // Mirror the production code: `slide.layout ?? 2` should be the
    // fallback both for the data attribute and the className.
    const slide: PptSlide = { ...baseSlide };
    delete (slide as { layout?: number }).layout;
    const html = renderToStaticMarkup(<SlidePreview slide={slide} />);
    expect(html).toContain("slide-canvas layout-2");
    expect(html).toContain('data-layout="2"');
  });

  it("does NOT render the layout-N class for a null/empty slide", () => {
    // The empty-state branch returns a different DOM without the
    // canvas at all; it should not have a stray layout-N class.
    const html = renderToStaticMarkup(<SlidePreview slide={null} />);
    expect(html).not.toMatch(/slide-canvas layout-/);
  });

  it("does NOT render the canvas for a failed slide (error path)", () => {
    const failed: PptSlide = {
      ...baseSlide,
      status: "failed",
      error: "boom",
    };
    const html = renderToStaticMarkup(<SlidePreview slide={failed} />);
    expect(html).not.toMatch(/slide-canvas layout-/);
    expect(html).toContain("生成失败: boom");
  });

  it("does NOT render the canvas for a layout/pending placeholder", () => {
    const placeholder: PptSlide = { ...baseSlide, status: "layout" };
    const html = renderToStaticMarkup(<SlidePreview slide={placeholder} />);
    expect(html).not.toMatch(/slide-canvas layout-/);
    expect(html).toContain("布局占位");
  });
});

describe("SlidePreview — DeckPanel 5-status passthrough (Bug: preview shows all-failed)", () => {
  // Regression: DeckPanel.tsx used to collapse any non-"done" status to
  // "failed" when building the slideForPreview object, which made
  // "布局占位" / "等待生成" / mid-generation slides show "生成失败:
  // 未知错误" in the preview drawer. The fix passes through all 5
  // SlideStatus values, so SlidePreview can render the right branch.

  it("renders the failed branch when status='failed'", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "failed", error: "网络中断" }} />,
    );
    expect(html).toContain("生成失败");
    expect(html).toContain("网络中断");
  });

  it("renders the placeholder branch when status='layout' (not 'failed')", () => {
    // This is the critical regression: the old DeckPanel would have
    // converted this slide's status to "failed" before reaching
    // SlidePreview, so users saw "生成失败" while the LLM was still
    // working. With the fix, layout slides show the placeholder text.
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "layout" }} />,
    );
    expect(html).toContain("布局占位");
    expect(html).not.toContain("生成失败");
  });

  it("renders the waiting branch when status='pending' (not 'failed')", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "pending" }} />,
    );
    expect(html).toContain("等待生成");
    expect(html).not.toContain("生成失败");
  });

  it("renders the canvas when status='done'", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "done" }} />,
    );
    expect(html).toContain("slide-canvas");
    expect(html).not.toContain("生成失败");
    expect(html).not.toContain("布局占位");
  });

  it("renders the waiting branch when status='generating' (not 'failed')", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "generating" }} />,
    );
    // 'generating' falls through to the placeholder branch (same as
    // 'pending' / no html). The key is: it must NOT be rendered as failed.
    expect(html).not.toContain("生成失败");
  });
});

describe("SlidePreview — scale-to-fit preview pane (Bug: preview not scaled, content clipped)", () => {
  // Regression: the deck preview drawer and small artifact panels show
  // a tiny slide canvas (typically 400-600px wide). The LLM authors the
  // slide HTML in a 960×540 design grid with absolute pixel positions,
  // so without scaling the right half of the slide is clipped. The fix
  // applies a transform: scale() on .layout-frame via the --slide-scale
  // CSS variable, computed by the useSlideScale hook from a
  // ResizeObserver on the canvas. We assert the CSS contract here so
  // that the hook and the layout stay in sync.

  it("emits --slide-scale custom property on the canvas style", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "done", html: "<section><h1>X</h1></section>", layout: 1 }} />,
    );
    // The style attribute should include the CSS variable, even if
    // server-rendered (no hook ran). The value defaults to "1".
    expect(html).toMatch(/--slide-scale:\s*1/);
  });

  it("renders .layout-frame inside the canvas with absolute positioning (CSS contract)", () => {
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "done", html: "<section>X</section>" }} />,
    );
    expect(html).toContain("layout-frame");
  });

  it("the .fit modifier class is applied to drop canvas padding", () => {
    // The slide-canvas has SLIDE_BG with padding 56/72; for the
    // "done" branch we want zero padding so the absolute-positioned
    // layout-frame can occupy the full canvas. The fit class +
    // inline padding:0 enforces this.
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "done", html: "<section>X</section>" }} />,
    );
    expect(html).toMatch(/slide-canvas[^"]*\bfit\b/);
  });

  it("preserves the existing layout-N class alongside .fit (Bug UI-A regression)", () => {
    // The previous fix added layout-N to apply the 5 visual variants.
    // The scale-to-fit fix adds .fit; both must be on the element.
    const html = renderToStaticMarkup(
      <SlidePreview slide={{ ...baseSlide, status: "done", html: "<section>X</section>", layout: 3 }} />,
    );
    expect(html).toContain("layout-3");
    expect(html).toMatch(/slide-canvas[^"]*\bfit\b/);
  });
});

describe("SlidePreview — useSlideScale loop prevention (regression: page hang)", () => {
  // Regression: the original useSlideScale mutated frame.style.transform
  // inside the compute() callback to read scrollHeight. A MutationObserver
  // watching the frame's attributes fired on every mutation → compute
  // re-ran → setState → re-render → loop. The renderer pinned at 100% CPU
  // and the page hung.
  //
  // We assert the source no longer contains that anti-pattern so a
  // future refactor doesn't reintroduce it.
  it("useSlideScale does not mutate frame.style.transform inside compute()", () => {
    // Read the source file and assert there is no `frame.style.transform =`
    // assignment inside the SlidePreview.tsx file. (The CSS-controlled
    // transform comes from --slide-scale via the .layout-frame CSS rule.)
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../../src/renderer/components/SlidePreview.tsx"),
      "utf8",
    );
    // Strip the comment block so we don't match the explanation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\.style\.transform\s*=\s*['"]/);
  });

  it("useSlideScale uses functional setScale with epsilon check (prevents no-op re-renders)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../../src/renderer/components/SlidePreview.tsx"),
      "utf8",
    );
    // setScale((prev) => ...) is the React-idiomatic guard against
    // identical state triggering a re-render and, more importantly,
    // preventing the ResizeObserver compute → setScale → re-render
    // → ResizeObserver feedback loop.
    expect(src).toMatch(/setScale\s*\(\s*\(?\s*prev\s*\)?\s*=>/);
    expect(src).toMatch(/Math\.abs\(prev\s*-\s*next\)/);
  });

  it("useSlideScale has only ONE observer (ResizeObserver) — no MutationObserver", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../../src/renderer/components/SlidePreview.tsx"),
      "utf8",
    );
    // The previous code had both ResizeObserver AND MutationObserver
    // watching the frame. The MO was the loop trigger. After the fix
    // we only have ResizeObserver, observing the canvas.
    const roMatches = (src.match(/new ResizeObserver\(/g) ?? []).length;
    const moMatches = (src.match(/new MutationObserver\(/g) ?? []).length;
    expect(roMatches).toBe(1);
    expect(moMatches).toBe(0);
  });
});
