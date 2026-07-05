import { beforeEach, describe, expect, it, vi } from "vitest";

const { outlineApplyDetail, pptApplyDetail, apiProjectDetail } = vi.hoisted(() => ({
  outlineApplyDetail: vi.fn(),
  pptApplyDetail: vi.fn(),
  apiProjectDetail: vi.fn(),
}));

vi.mock("../../../../src/renderer/stores/outline.js", () => ({
  useOutlineStore: {
    getState: () => ({ applyDetail: outlineApplyDetail }),
  },
}));

vi.mock("../../../../src/renderer/stores/pptGeneration.js", () => ({
  usePptGenerationStore: {
    getState: () => ({ applyDetail: pptApplyDetail, reset: vi.fn() }),
  },
}));

vi.mock("../../../../src/renderer/lib/api.js", () => ({
  api: {
    project: { detail: apiProjectDetail },
  },
}));

import { api } from "../../../../src/renderer/lib/api.js";
import { useOutlineStore } from "../../../../src/renderer/stores/outline.js";
import { usePptGenerationStore } from "../../../../src/renderer/stores/pptGeneration.js";
import { useProjectDetailStore } from "../../../../src/renderer/stores/projectDetail.js";

describe("useProjectDetailStore", () => {
  beforeEach(() => {
    useProjectDetailStore.setState({
      detail: null,
      loading: false,
      error: null,
      loadedProjectId: null,
    });
    vi.clearAllMocks();
  });

  it("load: sets loading then populates detail", async () => {
    const mockDetail = {
      id: "p1",
      title: "t",
      topic: "tp",
      status: "draft" as const,
      outline: "",
      pageCount: 0,
      createdAt: 1,
      updatedAt: 1,
      currentStage: "idle" as const,
      hasSource: false,
      hasOutline: false,
      hasHtml: false,
      html: null,
      htmlSize: null,
      lastGeneratedAt: null,
      lastError: null,
      source: "src",
      structuredOutline: { slides: [], generatedAt: 1 },
      style: { primaryColor: "#000", layout: "minimal", fontFamily: "sans" },
      slides: [{ id: "s1", html: "<x/>", status: "done" as const }],
    };
    vi.mocked(api.project.detail).mockResolvedValue(mockDetail);
    await useProjectDetailStore.getState().load("p1");
    const state = useProjectDetailStore.getState();
    expect(state.detail).toEqual(mockDetail);
    expect(state.loadedProjectId).toBe("p1");
    expect(state.loading).toBe(false);
  });

  it("load: skips if same id already loaded", async () => {
    const existing = {
      id: "p1",
      title: "",
      topic: "",
      status: "draft" as const,
      outline: "",
      pageCount: 0,
      createdAt: 0,
      updatedAt: 0,
      currentStage: "idle" as const,
      hasSource: false,
      hasOutline: false,
      hasHtml: false,
      html: null,
      htmlSize: null,
      lastGeneratedAt: null,
      lastError: null,
      source: null,
      structuredOutline: null,
      style: null,
      slides: [],
    };
    useProjectDetailStore.setState({ detail: existing, loadedProjectId: "p1" });
    await useProjectDetailStore.getState().load("p1");
    expect(api.project.detail).not.toHaveBeenCalled();
  });

  it("applySnapshot: dispatches to outline + ppt stores", () => {
    const detail = {
      id: "p1",
      title: "",
      topic: "",
      status: "draft" as const,
      outline: "",
      pageCount: 0,
      createdAt: 0,
      updatedAt: 0,
      currentStage: "idle" as const,
      hasSource: false,
      hasOutline: false,
      hasHtml: false,
      html: null,
      htmlSize: null,
      lastGeneratedAt: null,
      lastError: null,
      source: null,
      structuredOutline: { slides: [{ id: "s1", title: "T", bullets: [] }], generatedAt: 1 },
      style: null,
      slides: [{ id: "s1", html: "<x/>", status: "done" as const }],
    };
    useProjectDetailStore.getState().applySnapshot(detail);
    expect(useOutlineStore.getState().applyDetail).toHaveBeenCalledWith({
      slides: detail.structuredOutline!.slides,
      generatedAt: 1,
    });
    // 3rd arg is the titleById map from the structured outline, so
    // the artifact panel shows the slide's outline title instead of
    // its UUID when a project is re-opened. (Bug: title defaulted to
    // s.id, so the artifact panel read "101852029-313b-4ec8-..." for
    // each entry.)
    const call = usePptGenerationStore.getState().applyDetail.mock.calls[0];
    expect(call[0]).toBe("p1");
    expect(call[1]).toEqual([{ id: "s1", html: "<x/>", layout: 1, status: "done" }]);
    expect(call[2]).toBeDefined();
    expect(call[2]["s1"]).toBe("T");
  });

  it("applySnapshot: does not dispatch outline if structuredOutline is null", () => {
    const detail = {
      id: "p1",
      title: "",
      topic: "",
      status: "draft" as const,
      outline: "",
      pageCount: 0,
      createdAt: 0,
      updatedAt: 0,
      currentStage: "idle" as const,
      hasSource: false,
      hasOutline: false,
      hasHtml: false,
      html: null,
      htmlSize: null,
      lastGeneratedAt: null,
      lastError: null,
      source: null,
      structuredOutline: null,
      style: null,
      slides: [],
    };
    useProjectDetailStore.getState().applySnapshot(detail);
    expect(useOutlineStore.getState().applyDetail).not.toHaveBeenCalled();
  });
});
