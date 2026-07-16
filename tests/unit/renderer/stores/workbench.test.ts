import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/renderer/lib/api.js", () => ({
  api: {
    project: {
      create: vi.fn(),
      detail: vi.fn(),
      list: vi.fn(),
    },
    chat: {
      load: vi.fn(),
      send: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      removeQueueItem: vi.fn(),
      appendWorkflow: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    },
    stage: {
      collectSave: vi.fn(),
      outlineGenerate: vi.fn(),
      htmlGenerate: vi.fn(),
      slideRegenerate: vi.fn(),
    },
  },
}));

vi.mock("../../../../src/renderer/stores/project.js", () => ({
  useProjectStore: {
    getState: () => ({ load: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("../../../../src/renderer/stores/projectDetail.js", () => ({
  useProjectDetailStore: {
    getState: () => ({
      load: vi.fn().mockImplementation(async (id: string) => ({
        id,
        title: id,
        topic: "x",
        status: "draft",
        outline: "",
        pageCount: null,
        createdAt: 1,
        updatedAt: 1,
        currentStage: "idle",
        hasSource: false,
        hasOutline: false,
        hasHtml: false,
        html: null,
        htmlSize: null,
        lastGeneratedAt: null,
        lastError: null,
        source: null,
        brief: null,
        structuredOutline: null,
        style: null,
        slides: [],
      })),
    }),
  },
}));

vi.mock("../../../../src/renderer/stores/stageStream.js", () => ({
  useStageStreamStore: {
    getState: () => ({
      prepare: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    }),
  },
}));

vi.mock("../../../../src/renderer/stores/pptGeneration.js", () => ({
  usePptGenerationStore: {
    getState: () => ({
      initialize: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      cancel: vi.fn(),
      applySlideReady: vi.fn(),
      applySlideUpdated: vi.fn(),
      applyGenerateDone: vi.fn(),
      applyDetail: vi.fn(),
    }),
  },
}));

vi.mock("../../../../src/renderer/stores/outline.js", () => ({
  useOutlineStore: {
    getState: () => ({
      setOutline: vi.fn(),
      addSlide: vi.fn(),
      deleteSlide: vi.fn(),
      applyDetail: vi.fn(),
    }),
  },
}));

import { api } from "../../../../src/renderer/lib/api.js";
import { useChatStore } from "../../../../src/renderer/stores/chat.js";
import { useWorkbenchStore } from "../../../../src/renderer/stores/workbench.js";

const mockedApi = vi.mocked(api, true);

beforeEach(() => {
  useWorkbenchStore.setState({
    phase: "idle",
    activeProjectId: null,
    scenario: {
      id: "sales",
      name: "x",
      body: "",
      audience: "",
      goal: "",
      duration: "",
      pages: "",
    },
    brief: {
      client: "",
      audience: "",
      goal: "",
      duration: "",
      pages: "",
      template: "",
    },
    taskText: "",
    prompt: "",
    clarificationNotes: [],
    sourceRequirements: [],
    selectedSources: [],
    uploadedSources: [],
    outlineDraft: [],
    revisions: [],
    deckVersions: [],
    pendingRevisionId: null,
    searchProgress: 0,
    sidebarCollapsed: false,
    artifactOpen: true,
    artifactTab: "deck",
    deckPreviewOpen: false,
    deckPreviewRatio: 60,
    selectedSlide: 0,
    activeSourceId: null,
    sourceMenuOpen: false,
    toast: null,
  });
  useChatStore.setState({
    projectId: "p-1",
    items: [],
    queue: [],
    paused: false,
    pauseReason: null,
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

function setChatProject(id: string | null) {
  useChatStore.setState({
    projectId: id,
    items: [],
    queue: [],
    paused: false,
    pauseReason: null,
    loading: false,
    error: null,
  });
}

describe("useWorkbenchStore.submitPrompt — chat routing", () => {
  it("idle first-time text creates a project, opens it, then sends the original text", async () => {
    mockedApi.project.create.mockResolvedValue({
      id: "new-p",
      title: "新演示任务",
      topic: "我想做",
      status: "draft",
      outline: "",
      pageCount: null,
      createdAt: 1,
      updatedAt: 1,
      currentStage: "idle",
      hasSource: false,
      hasOutline: false,
      hasHtml: false,
    });
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-idle" });
    // Simulate openProject side-effect: after openProject(), chat store has
    // the new projectId so appendWorkflow + send are no-ops without it.
    mockedApi.chat.load.mockImplementation(async (id: string) => {
      setChatProject(id);
      return {
        projectId: id,
        items: [],
        queue: [],
        paused: false,
      };
    });

    await useWorkbenchStore.getState().submitPrompt("我想做一份银保培训讲义");

    expect(mockedApi.project.create).toHaveBeenCalledWith(
      "我想做一份银保培训讲义",
    );
    expect(mockedApi.chat.send).toHaveBeenCalledWith(
      "new-p",
      "我想做一份银保培训讲义",
    );
    expect(useWorkbenchStore.getState().activeProjectId).toBe("new-p");
    expect(useWorkbenchStore.getState().phase).toBe("clarify");
  });

  it("sends clarify text while retaining local field parsing", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-1" });
    useWorkbenchStore.setState({
      phase: "clarify",
      activeProjectId: "p-1",
      scenario: {
        id: "sales",
        name: "x",
        body: "",
        audience: "",
        goal: "",
        duration: "",
        pages: "",
      },
      brief: {
        client: "",
        audience: "",
        goal: "",
        duration: "",
        pages: "",
        template: "",
      },
    });

    await useWorkbenchStore
      .getState()
      .submitPrompt("客户是某银行，面向培训负责人");

    expect(mockedApi.chat.send).toHaveBeenCalledWith(
      "p-1",
      "客户是某银行，面向培训负责人",
    );
    const s = useWorkbenchStore.getState();
    expect(s.brief.client).toBe("某银行");
    expect(s.brief.audience).toBe("培训负责人");
    expect(s.clarificationNotes).toContain("客户是某银行，面向培训负责人");
  });

  it("sends sources-phase text and retains sourceRequirements", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-src" });
    useWorkbenchStore.setState({
      phase: "sources",
      activeProjectId: "p-1",
      sourceRequirements: [],
    });

    await useWorkbenchStore
      .getState()
      .submitPrompt("优先使用客户案例，避免使用过期版本");

    expect(mockedApi.chat.send).toHaveBeenCalledWith(
      "p-1",
      "优先使用客户案例，避免使用过期版本",
    );
    expect(useWorkbenchStore.getState().sourceRequirements).toContain(
      "优先使用客户案例，避免使用过期版本",
    );
  });

  it("sends outline-phase text and retains a local revision note (does not start generation)", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-ol" });
    useWorkbenchStore.setState({
      phase: "outline",
      activeProjectId: "p-1",
      revisions: [],
      prompt: "原始输入",
    });

    await useWorkbenchStore.getState().submitPrompt("原始输入");

    expect(mockedApi.chat.send).toHaveBeenCalledWith("p-1", "原始输入");
    const s = useWorkbenchStore.getState();
    expect(s.revisions).toHaveLength(1);
    expect(s.revisions[0].text).toBe("原始输入");
  });

  it("sends complete-phase text without starting generation", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-2" });
    useWorkbenchStore.setState({ phase: "complete", activeProjectId: "p-1" });

    await useWorkbenchStore.getState().submitPrompt("第 2 页加强合规");

    expect(mockedApi.chat.send).toHaveBeenCalledWith("p-1", "第 2 页加强合规");
    expect(useWorkbenchStore.getState().phase).toBe("complete");
  });

  it("busy phases (searching/buildingOutline/generating) do not enqueue chat messages", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-busy" });
    useWorkbenchStore.setState({
      phase: "generating",
      activeProjectId: "p-1",
    });

    await useWorkbenchStore.getState().submitPrompt("任何输入都应该被忽略");

    expect(mockedApi.chat.send).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().phase).toBe("generating");
  });

  it("preserves the prompt text when api.chat.send fails and shows a toast", async () => {
    mockedApi.chat.send.mockRejectedValue(new Error("后端断了"));
    useWorkbenchStore.setState({
      phase: "complete",
      activeProjectId: "p-1",
      prompt: "保留这段话",
    });

    await useWorkbenchStore.getState().submitPrompt("保留这段话");

    const s = useWorkbenchStore.getState();
    expect(mockedApi.chat.send).toHaveBeenCalledWith("p-1", "保留这段话");
    expect(s.prompt).toBe("保留这段话");
    expect(s.toast).toBe("后端断了");
  });

  it("clears the prompt only after api.chat.send resolves successfully", async () => {
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-clear" });
    useWorkbenchStore.setState({
      phase: "complete",
      activeProjectId: "p-1",
      prompt: "应当被清空",
    });

    await useWorkbenchStore.getState().submitPrompt("应当被清空");

    expect(useWorkbenchStore.getState().prompt).toBe("");
  });
});

describe("useWorkbenchStore business actions — workflow events", () => {
  it("confirmBrief appends brief-confirmed after the IPC succeeds", async () => {
    mockedApi.stage.collectSave.mockResolvedValue();
    mockedApi.chat.appendWorkflow.mockResolvedValue();
    useWorkbenchStore.setState({
      phase: "clarify",
      activeProjectId: "p-1",
      brief: {
        client: "某银行",
        audience: "培训",
        goal: "机会",
        duration: "15 分钟",
        pages: "8 页",
        template: "",
      },
      selectedSources: ["s1"],
      clarificationNotes: [],
      sourceRequirements: [],
    });

    await useWorkbenchStore.getState().confirmBrief("p-1");

    expect(mockedApi.chat.appendWorkflow).toHaveBeenCalledWith("p-1", {
      type: "brief-confirmed",
      payload: expect.objectContaining({}),
    });
  });

  it("approveSources appends sources-confirmed", async () => {
    mockedApi.stage.outlineGenerate.mockResolvedValue({
      phase: "done",
      slides: [],
    });
    mockedApi.chat.appendWorkflow.mockResolvedValue();
    useWorkbenchStore.setState({
      phase: "sources",
      activeProjectId: "p-1",
      selectedSources: ["s1"],
    });

    await useWorkbenchStore.getState().approveSources("p-1");

    expect(mockedApi.chat.appendWorkflow).toHaveBeenCalledWith("p-1", {
      type: "sources-confirmed",
      payload: expect.objectContaining({}),
    });
  });

  it("approveOutline appends outline-confirmed", async () => {
    mockedApi.stage.htmlGenerate.mockResolvedValue({
      phase: "done",
      completed: 0,
      failed: 0,
      total: 0,
    });
    mockedApi.chat.appendWorkflow.mockResolvedValue();
    useWorkbenchStore.setState({
      phase: "outline",
      activeProjectId: "p-1",
      outlineDraft: [],
    });

    await useWorkbenchStore.getState().approveOutline("p-1");

    expect(mockedApi.chat.appendWorkflow).toHaveBeenCalledWith("p-1", {
      type: "outline-confirmed",
      payload: expect.objectContaining({}),
    });
  });

  it("startRevision appends revision-requested and the generation lifecycle event", async () => {
    mockedApi.stage.htmlGenerate.mockResolvedValue({
      phase: "done",
      completed: 1,
      failed: 0,
      total: 1,
    });
    mockedApi.chat.appendWorkflow.mockResolvedValue();
    useWorkbenchStore.setState({
      phase: "complete",
      activeProjectId: "p-1",
      outlineDraft: [{ id: "s1", page: 1, title: "t", note: "", source: "" }],
    });

    await useWorkbenchStore.getState().startRevision("p-1", "调整配色");

    const calls = mockedApi.chat.appendWorkflow.mock.calls;
    const types = calls.map((c) => c[1].type);
    expect(types).toContain("revision-requested");
    expect(types).toContain("generation-started");
  });
});
