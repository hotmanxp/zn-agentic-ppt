import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const g = globalThis as any;
  g.window = g.window ?? {};
  g.window.api = {
    project: { get: vi.fn() },
    stage: {
      collectSave: vi.fn(),
      outlineGenerate: vi.fn(),
      outlineUpdate: vi.fn(),
      slideAdd: vi.fn(),
      slideDelete: vi.fn(),
      slideRegenerate: vi.fn(),
      htmlGenerate: vi.fn(),
      styleSave: vi.fn(),
    },
  };
});

import { useOutlineStore } from "../../../../src/renderer/stores/outline.js";

describe("useOutlineStore.applyDetail", () => {
  beforeEach(() => {
    useOutlineStore.setState({ outline: null, style: null, loaded: false });
  });

  it("sets outline when called", () => {
    useOutlineStore.getState().applyDetail({
      slides: [{ id: "s1", title: "T", bullets: ["a"] }],
      generatedAt: 1700000000,
    });
    expect(useOutlineStore.getState().outline?.slides[0].id).toBe("s1");
    expect(useOutlineStore.getState().loaded).toBe(true);
  });
});
