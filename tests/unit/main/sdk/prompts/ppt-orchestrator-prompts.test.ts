import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

import { renderPrompt } from "../../../../../src/main/sdk/prompts/index.js";

describe("PPT orchestrator prompts", () => {
  it("PPT_PARENT_SYSTEM_PROMPT renders without throwing and contains 6 validation rules", async () => {
    const out = await renderPrompt("PPT_PARENT_SYSTEM_PROMPT", {});
    // 禁止要求「输出 JSON / 输出摘要」作为最终交付物；「不要输出 JSON 摘要」是允许的（明确的负面指令）
    // 「不要输出 JSON 摘要」是允许的明确负面指令；不应有正面要求
    expect(out).toMatch(/不要\s*输出\s*JSON/);
    expect(out).toMatch(/不要\s*Write\/Edit/);
    expect(out).toMatch(/<section>/);
    expect(out).toMatch(/data-layout/);
    expect(out).toMatch(/200\s*字符/);
  });

  it("PPT_PARENT_USER_PROMPT renders with full context", async () => {
    const out = await renderPrompt("PPT_PARENT_USER_PROMPT", {
      outlineSummary: "30 slides total",
      intentJson: { audience: "execs" },
      styleJson: { primaryColor: "#000" },
      slidesJson: [{ id: "s1", title: "T1", layout: 1 }],
      subAgentPromptsJson: [{ slideId: "s1", prompt: "..." }],
    });
    expect(out).toContain("30 slides total");
    expect(out).toContain('"audience": "execs"');
    expect(out).toContain('"slideId": "s1"');
  });

  it("PPT_SLIDE_GENERATOR_PROMPT renders per-slide with neighbors", async () => {
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
