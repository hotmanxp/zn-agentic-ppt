import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

import { renderPrompt } from "../../../../../src/main/sdk/prompts/index.js";

describe("PPT orchestrator prompts (P1-4: parent is dispatcher-only)", () => {
  it("PPT_PARENT_SYSTEM_PROMPT is dispatcher-only — no validation, no retry, no file reads", async () => {
    const out = await renderPrompt("PPT_PARENT_SYSTEM_PROMPT", {});
    // The parent LLM's only job is dispatching. Explicitly forbids
    // the old validation/retry work the parent used to do.
    expect(out).toMatch(/不要读 slide 文件/);
    expect(out).toMatch(/不要做 6 项验证/);
    expect(out).toMatch(/不要 retry/);
    expect(out).toMatch(/不要输出 JSON 摘要/);
  });

  it("PPT_PARENT_USER_PROMPT renders a compact dispatch template", async () => {
    const out = await renderPrompt("PPT_PARENT_USER_PROMPT", {
      totalSlides: "12",
      slidesJson: [
        { id: "s1", title: "封面", layout: 1 },
        { id: "s2", title: "趋势", layout: 4 },
      ],
    });
    // Slide list is embedded so the parent can iterate dispatch
    expect(out).toContain('"id": "s1"');
    expect(out).toContain('"id": "s2"');
    // Dispatch instructions reference the task file contract
    expect(out).toMatch(/tasks\//);
    expect(out).toMatch(/slides\//);
  });

  it("PPT_SLIDE_GENERATOR_PROMPT still renders the per-slide template (kept for reference / e2e)", async () => {
    const out = await renderPrompt("PPT_SLIDE_GENERATOR_PROMPT", {
      slideId: "slide-3",
      title: "市场分析",
      bullets: "  1. TAM 100亿\n  2. CAGR 12%",
      notes: "",
      layout: "2",
      layoutDirection: "双栏卡片",
      neighborPaths: "slides/slide-2.html\nslides/slide-4.html",
      style: '{"primaryColor":"#FF6600"}',
    });
    expect(out).toContain("slide-3");
    expect(out).toContain("市场分析");
    expect(out).toContain("TAM 100亿");
    expect(out).toContain("slides/slide-2.html");
    expect(out).toMatch(/Read/);
    expect(out).toMatch(/Write/);
    expect(out).toMatch(/16\s*[:：]\s*9|960\s*[×x]\s*540/);
  });
});
