import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/renderer/lib/api.js", () => ({
  api: {
    chat: {
      load: vi.fn(),
      send: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      removeQueueItem: vi.fn(),
      appendWorkflow: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    },
  },
}));

import { api } from "../../../../src/renderer/lib/api.js";
import { useChatStore } from "../../../../src/renderer/stores/chat.js";

const mockedApi = vi.mocked(api);

const emptySnapshot = {
  projectId: "p-1",
  items: [],
  queue: [],
  paused: false,
};

beforeEach(() => {
  useChatStore.setState({
    projectId: null,
    items: [],
    queue: [],
    paused: false,
    pauseReason: null,
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("useChatStore.load", () => {
  it("sets projectId before awaiting and replaces state on success", async () => {
    mockedApi.chat.load.mockResolvedValue(emptySnapshot);
    const loadPromise = useChatStore.getState().load("p-1");
    expect(useChatStore.getState().projectId).toBe("p-1");
    await loadPromise;
    const s = useChatStore.getState();
    expect(s.projectId).toBe("p-1");
    expect(s.items).toEqual([]);
    expect(s.queue).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("preserves existing items on failure and sets error", async () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [{ kind: "message", id: "x", projectId: "p-1", role: "user", text: "hi", createdAt: 1 }],
      queue: [],
    });
    mockedApi.chat.load.mockRejectedValue(new Error("boom"));
    await useChatStore.getState().load("p-1");
    const s = useChatStore.getState();
    expect(s.projectId).toBe("p-1");
    expect(s.items).toHaveLength(1);
    expect(s.error).toBe("boom");
    expect(s.loading).toBe(false);
  });

  it("snapshot for current project replaces state", () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [{ kind: "message", id: "x", projectId: "p-1", role: "user", text: "hi", createdAt: 1 }],
      queue: [],
    });
    useChatStore.getState().applyEvent({
      type: "snapshot",
      projectId: "p-1",
      snapshot: {
        projectId: "p-1",
        items: [
          { kind: "message", id: "y", projectId: "p-1", role: "assistant", text: "ok", createdAt: 2 },
        ],
        queue: [],
        paused: true,
        pauseReason: "rate",
      },
    });
    const s = useChatStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].id).toBe("y");
    expect(s.paused).toBe(true);
    expect(s.pauseReason).toBe("rate");
  });
});

describe("useChatStore.applyEvent project guard", () => {
  it("ignores events for another project", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "assistant-delta",
      projectId: "p-2",
      queueId: "q-2",
      text: "wrong",
    });
    expect(useChatStore.getState().items).toEqual([]);
  });

  it("ignores snapshot for another project — does not mutate", () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [
        { kind: "message", id: "x", projectId: "p-1", role: "user", text: "hi", createdAt: 1 },
      ],
    });
    useChatStore.getState().applyEvent({
      type: "snapshot",
      projectId: "p-2",
      snapshot: { projectId: "p-2", items: [], queue: [], paused: false },
    });
    const s = useChatStore.getState();
    expect(s.projectId).toBe("p-1");
    expect(s.items).toHaveLength(1);
  });
});

describe("useChatStore.applyEvent assistant-delta", () => {
  it("creates assistant message on first delta and concatenates further deltas", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "assistant-delta",
      projectId: "p-1",
      queueId: "q-1",
      text: "hello",
    });
    useChatStore.getState().applyEvent({
      type: "assistant-delta",
      projectId: "p-1",
      queueId: "q-1",
      text: " world",
    });
    expect(useChatStore.getState().items).toEqual([
      expect.objectContaining({ kind: "message", role: "assistant", text: "hello world" }),
    ]);
  });

  it("keeps separate assistant messages for different queueIds", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "assistant-delta",
      projectId: "p-1",
      queueId: "q-1",
      text: "A",
    });
    useChatStore.getState().applyEvent({
      type: "assistant-delta",
      projectId: "p-1",
      queueId: "q-2",
      text: "B",
    });
    const s = useChatStore.getState();
    expect(s.items).toHaveLength(2);
    expect(s.items.find((it) => (it as { queueId?: string }).queueId === "q-1")).toMatchObject({
      text: "A",
    });
    expect(s.items.find((it) => (it as { queueId?: string }).queueId === "q-2")).toMatchObject({
      text: "B",
    });
  });
});

describe("useChatStore.applyEvent tool lifecycle", () => {
  it("tool-start appends a running tool item", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "tool-start",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "tu-1",
      name: "read",
      input: { path: "x" },
    });
    const s = useChatStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({
      kind: "tool",
      toolUseId: "tu-1",
      name: "read",
      input: { path: "x" },
      status: "running",
    });
  });

  it("tool-done updates the matching tool item with output and finishedAt", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "tool-start",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "tu-1",
      name: "read",
      input: { path: "x" },
    });
    const before = Date.now();
    useChatStore.getState().applyEvent({
      type: "tool-done",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "tu-1",
      output: { ok: true },
    });
    const tool = useChatStore
      .getState()
      .items.find((it) => it.kind === "tool" && it.toolUseId === "tu-1");
    expect(tool).toMatchObject({
      kind: "tool",
      toolUseId: "tu-1",
      status: "done",
      output: { ok: true },
    });
    expect((tool as { finishedAt?: number }).finishedAt).toBeGreaterThanOrEqual(before);
  });

  it("tool-error updates the matching tool item with error and finishedAt", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "tool-start",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "tu-2",
      name: "write",
      input: {},
    });
    useChatStore.getState().applyEvent({
      type: "tool-error",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "tu-2",
      error: "nope",
    });
    const tool = useChatStore
      .getState()
      .items.find((it) => it.kind === "tool" && it.toolUseId === "tu-2");
    expect(tool).toMatchObject({
      kind: "tool",
      toolUseId: "tu-2",
      status: "error",
    });
    expect((tool as { error?: string }).error).toBe("nope");
  });

  it("does nothing if tool-done arrives without a matching tool-start", () => {
    useChatStore.setState({ projectId: "p-1", items: [] });
    useChatStore.getState().applyEvent({
      type: "tool-done",
      projectId: "p-1",
      queueId: "q-1",
      toolUseId: "missing",
      output: { ok: true },
    });
    expect(useChatStore.getState().items).toEqual([]);
  });
});

describe("useChatStore.applyEvent queue-status", () => {
  it("updates the matching queue item and paused/pauseReason", () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [],
      queue: [
        { id: "q-1", text: "hi", status: "queued", createdAt: 1, updatedAt: 1 },
      ],
      paused: false,
    });
    useChatStore.getState().applyEvent({
      type: "queue-status",
      projectId: "p-1",
      item: { id: "q-1", text: "hi", status: "running", createdAt: 1, updatedAt: 2 },
      paused: true,
      pauseReason: "rate-limit",
    });
    const s = useChatStore.getState();
    expect(s.queue[0].status).toBe("running");
    expect(s.paused).toBe(true);
    expect(s.pauseReason).toBe("rate-limit");
  });

  it("inserts the queue item if id is new", () => {
    useChatStore.setState({ projectId: "p-1", items: [], queue: [] });
    useChatStore.getState().applyEvent({
      type: "queue-status",
      projectId: "p-1",
      item: { id: "q-new", text: "x", status: "queued", createdAt: 1, updatedAt: 1 },
      paused: false,
    });
    const s = useChatStore.getState();
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0].id).toBe("q-new");
  });
});

describe("useChatStore.applyEvent project-changed", () => {
  it("does not mutate timeline", () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [{ kind: "message", id: "x", projectId: "p-1", role: "user", text: "hi", createdAt: 1 }],
    });
    useChatStore.getState().applyEvent({ type: "project-changed", projectId: "p-1" });
    const s = useChatStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.projectId).toBe("p-1");
  });
});

describe("useChatStore.reset", () => {
  it("clears all fields", () => {
    useChatStore.setState({
      projectId: "p-1",
      items: [{ kind: "message", id: "x", projectId: "p-1", role: "user", text: "hi", createdAt: 1 }],
      queue: [{ id: "q-1", text: "x", status: "queued", createdAt: 1, updatedAt: 1 }],
      paused: true,
      pauseReason: "rate",
      loading: true,
      error: "boom",
    });
    useChatStore.getState().reset();
    const s = useChatStore.getState();
    expect(s.projectId).toBeNull();
    expect(s.items).toEqual([]);
    expect(s.queue).toEqual([]);
    expect(s.paused).toBe(false);
    expect(s.pauseReason).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });
});

describe("useChatStore action passthroughs", () => {
  it("send returns the queueId from api.chat.send", async () => {
    useChatStore.setState({ projectId: "p-1" });
    mockedApi.chat.send.mockResolvedValue({ queueId: "q-99" });
    const id = await useChatStore.getState().send("hi");
    expect(mockedApi.chat.send).toHaveBeenCalledWith("p-1", "hi");
    expect(id).toBe("q-99");
  });

  it("cancel calls api.chat.cancel with the current projectId", async () => {
    useChatStore.setState({ projectId: "p-1" });
    mockedApi.chat.cancel.mockResolvedValue({ ok: true });
    await useChatStore.getState().cancel();
    expect(mockedApi.chat.cancel).toHaveBeenCalledWith("p-1");
  });

  it("retry forwards queueId to api.chat.retry", async () => {
    useChatStore.setState({ projectId: "p-1" });
    mockedApi.chat.retry.mockResolvedValue();
    await useChatStore.getState().retry("q-1");
    expect(mockedApi.chat.retry).toHaveBeenCalledWith("p-1", "q-1");
  });

  it("removeQueueItem forwards queueId to api.chat.removeQueueItem", async () => {
    useChatStore.setState({ projectId: "p-1" });
    mockedApi.chat.removeQueueItem.mockResolvedValue();
    await useChatStore.getState().removeQueueItem("q-1");
    expect(mockedApi.chat.removeQueueItem).toHaveBeenCalledWith("p-1", "q-1");
  });

  it("appendWorkflow forwards to api.chat.appendWorkflow", async () => {
    useChatStore.setState({ projectId: "p-1" });
    mockedApi.chat.appendWorkflow.mockResolvedValue();
    const payload = {
      type: "brief-confirmed" as const,
      payload: { foo: "bar" },
    };
    await useChatStore.getState().appendWorkflow(payload);
    expect(mockedApi.chat.appendWorkflow).toHaveBeenCalledWith("p-1", payload);
  });
});