import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/renderer/lib/api.js", () => ({
  api: {
    brief: {
      optimize: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      answer: vi.fn(),
      onAskUserQuestion: vi.fn().mockReturnValue(() => {}),
      onDone: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
    },
  },
}));

import { api } from "../../../../src/renderer/lib/api.js";
import { useBriefOptimizeStore } from "../../../../src/renderer/stores/briefOptimize.js";

const mockedApi = vi.mocked(api);

describe("useBriefOptimizeStore", () => {
  beforeEach(() => {
    useBriefOptimizeStore.setState({ phase: "idle", current: null, error: null, lastBrief: null });
    vi.clearAllMocks();
    mockedApi.brief.optimize.mockResolvedValue({ ok: true });
    mockedApi.brief.cancel.mockResolvedValue({ ok: true });
    mockedApi.brief.onAskUserQuestion.mockReturnValue(() => {});
    mockedApi.brief.onDone.mockReturnValue(() => {});
    mockedApi.brief.onError.mockReturnValue(() => {});
  });

  it("start calls api.brief.optimize (subscriptions live in useWorkbenchSubscriptions)", async () => {
    await useBriefOptimizeStore.getState().start("p1", null);
    expect(mockedApi.brief.optimize).toHaveBeenCalledWith("p1", null);
    // Subscriptions are NOT registered by start() anymore — they live in
    // useWorkbenchSubscriptions at the Workbench root.
    expect(mockedApi.brief.onAskUserQuestion).not.toHaveBeenCalled();
    expect(mockedApi.brief.onDone).not.toHaveBeenCalled();
    expect(mockedApi.brief.onError).not.toHaveBeenCalled();
  });

  it("applyQuestion transitions to asking and sets current", () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: "q1",
      turn: 1,
      questions: [
        {
          question: "q",
          header: "h",
          options: [{ label: "a" }, { label: "b" }],
          multiSelect: false,
        },
      ],
    });
    expect(useBriefOptimizeStore.getState().phase).toBe("asking");
    expect(useBriefOptimizeStore.getState().current?.qid).toBe("q1");
  });

  it("answer calls api.brief.answer with qid and value", () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: "q1",
      turn: 1,
      questions: [
        {
          question: "q",
          header: "h",
          options: [{ label: "a" }, { label: "b" }],
          multiSelect: false,
        },
      ],
    });
    useBriefOptimizeStore.getState().answer("q1", { q: "a" });
    expect(mockedApi.brief.answer).toHaveBeenCalledWith("q1", {
      cancelled: false,
      value: { q: "a" },
    });
    expect(useBriefOptimizeStore.getState().phase).toBe("optimizing");
  });

  it("applyDone transitions to done and stores lastBrief", () => {
    const brief = { markdown: '{"brief":{"client":"x"}}' };
    useBriefOptimizeStore.getState().applyDone(brief);
    expect(useBriefOptimizeStore.getState().phase).toBe("done");
    expect(useBriefOptimizeStore.getState().error).toBeNull();
    expect(useBriefOptimizeStore.getState().lastBrief).toEqual(brief);
  });
});
