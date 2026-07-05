import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/renderer/lib/api.js", () => {
  return {
    api: {
      stage: {
        outlineGenerate: vi.fn(),
        slideRegenerate: vi.fn(),
        outlineCancel: vi.fn(),
        slideCancel: vi.fn(),
      },
    },
  };
});

import { api } from "../../../../src/renderer/lib/api.js";
import { useStageStreamStore } from "../../../../src/renderer/stores/stageStream.js";

const mockedApi = vi.mocked(api);

beforeEach(() => {
  useStageStreamStore.getState().reset();
  vi.clearAllMocks();
});

describe("useStageStreamStore", () => {
  it("starts in idle phase", () => {
    const s = useStageStreamStore.getState();
    expect(s.phase).toBe("idle");
    expect(s.kind).toBeNull();
    expect(s.chars).toBe(0);
  });

  it("start(outline) sets streaming and calls outlineGenerate", async () => {
    mockedApi.stage.outlineGenerate.mockResolvedValue({
      phase: "done",
      slides: [{ id: "s1", title: "A", bullets: [] }],
    });
    await useStageStreamStore.getState().start("outline", "proj-1");
    expect(mockedApi.stage.outlineGenerate).toHaveBeenCalledWith("proj-1");
    const s = useStageStreamStore.getState();
    expect(s.phase).toBe("done");
    expect(s.kind).toBe("outline");
    expect(s.projectId).toBe("proj-1");
  });

  it("applyEvent updates chars and html for matching project", () => {
    useStageStreamStore.setState({ kind: "outline", projectId: "proj-1", phase: "streaming" });
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1",
      projectId: "proj-1",
      kind: "outline",
      phase: "streaming",
      chars: 500,
    });
    const s = useStageStreamStore.getState();
    expect(s.chars).toBe(500);
  });

  it("applyEvent ignores events for a different project", () => {
    useStageStreamStore.setState({
      kind: "outline",
      projectId: "proj-1",
      phase: "streaming",
      chars: 100,
    });
    useStageStreamStore.getState().applyEvent({
      runId: "proj-2",
      projectId: "proj-2",
      kind: "outline",
      phase: "streaming",
      chars: 999,
    });
    expect(useStageStreamStore.getState().chars).toBe(100);
  });

  it("applyEvent slide-regen matches by projectId AND slideId", () => {
    useStageStreamStore.setState({
      kind: "slide-regen",
      projectId: "proj-1",
      slideId: "sA",
      phase: "streaming",
    });
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1:sB",
      projectId: "proj-1",
      slideId: "sB",
      kind: "slide-regen",
      phase: "streaming",
      chars: 999,
    });
    expect(useStageStreamStore.getState().chars).toBe(0);
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1:sA",
      projectId: "proj-1",
      slideId: "sA",
      kind: "slide-regen",
      phase: "streaming",
      chars: 250,
    });
    expect(useStageStreamStore.getState().chars).toBe(250);
  });

  it("cancel(outline) sets cancelling and calls outlineCancel", async () => {
    useStageStreamStore.setState({ kind: "outline", projectId: "proj-1", phase: "streaming" });
    mockedApi.stage.outlineCancel.mockResolvedValue({ ok: true });
    await useStageStreamStore.getState().cancel();
    expect(mockedApi.stage.outlineCancel).toHaveBeenCalledWith("proj-1");
    expect(useStageStreamStore.getState().phase).toBe("cancelling");
  });

  it("cancel(slide-regen) calls slideCancel with projectId+slideId", async () => {
    useStageStreamStore.setState({
      kind: "slide-regen",
      projectId: "proj-1",
      slideId: "sA",
      phase: "streaming",
    });
    mockedApi.stage.slideCancel.mockResolvedValue({ ok: true });
    await useStageStreamStore.getState().cancel();
    expect(mockedApi.stage.slideCancel).toHaveBeenCalledWith("proj-1", "sA");
  });

  it("reset clears all state", () => {
    useStageStreamStore.setState({
      kind: "outline",
      projectId: "proj-1",
      phase: "streaming",
      chars: 500,
      html: "x",
    });
    useStageStreamStore.getState().reset();
    const s = useStageStreamStore.getState();
    expect(s.phase).toBe("idle");
    expect(s.kind).toBeNull();
    expect(s.projectId).toBeNull();
    expect(s.chars).toBe(0);
    expect(s.html).toBe("");
  });

  it("applyEvent done phase updates phase to done", () => {
    useStageStreamStore.setState({
      kind: "outline",
      projectId: "proj-1",
      phase: "streaming",
      chars: 100,
    });
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1",
      projectId: "proj-1",
      kind: "outline",
      phase: "done",
      chars: 500,
    });
    const s = useStageStreamStore.getState();
    expect(s.phase).toBe("done");
    expect(s.chars).toBe(500);
  });

  it("applyEvent cancelled phase updates phase to cancelled", () => {
    useStageStreamStore.setState({
      kind: "slide-regen",
      projectId: "proj-1",
      slideId: "sA",
      phase: "streaming",
    });
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1:sA",
      projectId: "proj-1",
      slideId: "sA",
      kind: "slide-regen",
      phase: "cancelled",
      chars: 200,
    });
    expect(useStageStreamStore.getState().phase).toBe("cancelled");
  });
});

describe("useStageStreamStore.prepare (Bug: outline 0% progress)", () => {
  // Regression: previously, the caller (workbench.approveSources) would
  // call `stageStream.reset()` before triggering outlineGenerate, which
  // left `kind = null`. The IPC was already streaming events (kind =
  // "outline", projectId = id), but applyEvent's `s.kind !== e.kind`
  // check rejected every event. The UI ProcessCard was stuck at 0%
  // for the full ~30s LLM call.
  //
  // Fix: `prepare(kind, projectId)` sets the state without triggering
  // the IPC, so the in-flight events are accepted.

  it("sets kind/projectId/phase=streaming without calling any IPC method", () => {
    useStageStreamStore.getState().prepare("outline", "proj-1");
    const s = useStageStreamStore.getState();
    expect(s.kind).toBe("outline");
    expect(s.projectId).toBe("proj-1");
    expect(s.phase).toBe("streaming");
    expect(s.chars).toBe(0);
    expect(s.html).toBe("");
    expect(mockedApi.stage.outlineGenerate).not.toHaveBeenCalled();
  });

  it("after prepare(), applyEvent accepts matching outline streaming events", () => {
    useStageStreamStore.getState().prepare("outline", "proj-1");
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1",
      projectId: "proj-1",
      kind: "outline",
      phase: "streaming",
      chars: 200,
    });
    expect(useStageStreamStore.getState().chars).toBe(200);
    expect(useStageStreamStore.getState().phase).toBe("streaming");
  });

  it("after prepare(), applyEvent accepts the done event and transitions to done", () => {
    useStageStreamStore.getState().prepare("outline", "proj-1");
    useStageStreamStore.getState().applyEvent({
      runId: "proj-1",
      projectId: "proj-1",
      kind: "outline",
      phase: "done",
      chars: 1500,
      html: "...",
    });
    const s = useStageStreamStore.getState();
    expect(s.phase).toBe("done");
    expect(s.chars).toBe(1500);
  });

  it("prepare() is idempotent (call it twice with same args, no error)", () => {
    useStageStreamStore.getState().prepare("outline", "proj-1");
    useStageStreamStore.getState().prepare("outline", "proj-1");
    const s = useStageStreamStore.getState();
    expect(s.kind).toBe("outline");
    expect(s.projectId).toBe("proj-1");
  });
});
