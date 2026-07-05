import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const g = globalThis as any;
  g.window = g.window ?? {};
  g.window.api = {
    stage: {
      htmlGenerate: vi.fn(),
      htmlCancel: vi.fn(),
    },
  };
});

import { usePptGenerationStore } from "../../../../src/renderer/stores/pptGeneration.js";

describe("usePptGenerationStore.applyDetail", () => {
  beforeEach(() => {
    usePptGenerationStore.setState({
      projectId: null,
      slides: {},
      phase: "idle",
      completed: 0,
      failed: 0,
      total: 0,
    });
  });

  it("populates slides from detail payload", () => {
    usePptGenerationStore.getState().applyDetail("p1", [
      { id: "s1", html: "<x/>", status: "done", layout: 2 },
      { id: "s2", html: "<y/>", status: "failed", error: "boom" },
    ]);
    const state = usePptGenerationStore.getState();
    expect(state.projectId).toBe("p1");
    expect(state.slides.s1.status).toBe("done");
    expect(state.slides.s1.layout).toBe(2);
    expect(state.slides.s2.status).toBe("failed");
    expect(state.slides.s2.error).toBe("boom");
    expect(state.total).toBe(2);
    expect(state.phase).toBe("done");
  });

  it("reset clears all state", () => {
    usePptGenerationStore
      .getState()
      .applyDetail("p1", [{ id: "s1", html: "<x/>", status: "done" }]);
    usePptGenerationStore.getState().reset();
    const state = usePptGenerationStore.getState();
    expect(state.projectId).toBeNull();
    expect(state.slides).toEqual({});
    expect(state.phase).toBe("idle");
  });
});

describe("usePptGenerationStore.applySlideReady — projectId filter (Bug: cross-project event bleed)", () => {
  beforeEach(() => {
    usePptGenerationStore.setState({
      projectId: null,
      slides: {},
      phase: "idle",
      completed: 0,
      failed: 0,
      total: 0,
    });
  });

  it("ignores events from a different project (prevents stale-event overwrite)", () => {
    // Step 1: user starts project A
    usePptGenerationStore.getState().applySlideReady({
      projectId: "project-A",
      slideId: "s1",
      status: "done",
      html: "<h1>real</h1>",
      completed: 1,
      total: 1,
    });
    expect(usePptGenerationStore.getState().slides.s1.html).toBe("<h1>real</h1>");

    // Step 2: a stale "failed" event from a previous project (project-B)
    // arrives AFTER the user already moved to project A. The store must
    // ignore it, otherwise the user would see "生成失败" in the preview
    // even though project A's slide is fine.
    usePptGenerationStore.getState().applySlideReady({
      projectId: "project-B",
      slideId: "s1",
      status: "failed",
      error: "stale from previous project",
      completed: 0,
      total: 1,
    });
    expect(usePptGenerationStore.getState().slides.s1.status).toBe("done");
    expect(usePptGenerationStore.getState().slides.s1.html).toBe("<h1>real</h1>");
  });

  it("accepts events with no projectId set yet (first event after start)", () => {
    // When applySlideReady fires before projectId is set in the store
    // (e.g. events arriving concurrently with start()), we should still
    // accept them. The check is `cur.projectId && cur.projectId !== e.projectId`
    // — both sides must be set to filter; if cur.projectId is null, we
    // accept any incoming event.
    usePptGenerationStore.getState().applySlideReady({
      projectId: "first-project",
      slideId: "s1",
      status: "done",
      html: "<h1>ok</h1>",
      completed: 1,
      total: 1,
    });
    expect(usePptGenerationStore.getState().slides.s1.status).toBe("done");
  });
});

describe("usePptGenerationStore.applyDetail — titleById (Bug: artifact panel shows UUID)", () => {
  // Regression: re-opening a generated project showed UUIDs in the
  // artifact panel's per-slide list and the slide preview header
  // because ProjectDetail.slides (from disk) only carries
  // {id, html, layout, status, error} — no title. applyDetail used
  // `title: s.id` as a fallback. The fix: applySnapshot builds a
  // titleById from the structured outline and passes it to applyDetail.
  beforeEach(() => {
    usePptGenerationStore.setState({
      projectId: null,
      slides: {},
      phase: "idle",
      completed: 0,
      failed: 0,
      total: 0,
    });
  });

  it("uses title from titleById when provided", () => {
    usePptGenerationStore.getState().applyDetail(
      "p1",
      [
        { id: "uuid-a", html: "<a/>", status: "done" },
        { id: "uuid-b", html: "<b/>", status: "done" },
      ],
      { "uuid-a": "银企数字化学习平台方案", "uuid-b": "银行人才培养三大挑战" },
    );
    const s = usePptGenerationStore.getState();
    expect(s.slides["uuid-a"].title).toBe("银企数字化学习平台方案");
    expect(s.slides["uuid-b"].title).toBe("银行人才培养三大挑战");
  });

  it("falls back to id when titleById is missing for a slide", () => {
    usePptGenerationStore.getState().applyDetail(
      "p1",
      [{ id: "uuid-a", html: "<a/>", status: "done" }],
      { "uuid-other": "Other Title" },
    );
    // titleById is provided but doesn't have uuid-a → fallback to id
    expect(usePptGenerationStore.getState().slides["uuid-a"].title).toBe("uuid-a");
  });

  it("falls back to id when titleById is omitted entirely", () => {
    usePptGenerationStore.getState().applyDetail("p1", [
      { id: "uuid-a", html: "<a/>", status: "done" },
    ]);
    expect(usePptGenerationStore.getState().slides["uuid-a"].title).toBe("uuid-a");
  });
});
