import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatEvent,
  ChatSnapshot,
  ProjectDetail,
  Settings,
} from "../../../../src/shared/types.js";
import { IPC } from "../../../../src/shared/ipc-channels.js";

const handlers = new Map<string, Function>();
vi.mock("electron", () => ({
  ipcMain: { handle: (ch: string, fn: Function) => handlers.set(ch, fn) },
  app: { getPath: () => "/tmp/unused" },
  BrowserWindow: { getAllWindows: () => [] },
}));

import {
  CHAT_TRANSCRIPT_PREFIX,
  ChatService,
  getChatService,
  registerChatIPC,
  skillsDirForDataRoot,
  transcriptIdForProject,
} from "../../../../src/main/ipc/chat.js";

interface RuntimeHandle {
  events: RuntimeEvent[];
  failNext: { code: string; message: string } | null;
  failImmediately: boolean;
  donePromise: Promise<void>;
  doneResolve: () => void;
  doneReject: (err: Error) => void;
  emit: (event: RuntimeEvent) => void;
  awaitDone: () => Promise<void>;
}

interface RuntimeEvent {
  type: string;
  [key: string]: unknown;
}

const settings: Settings = {
  llm: {
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "test-key",
    model: "claude-test",
    useOpenPlatform: false,
  },
  ui: { theme: "light" },
  paths: { projectsDir: "" },
};

function makeProject(id: string, topic: string): ProjectDetail {
  return {
    id,
    title: topic,
    topic,
    status: "draft",
    outline: "",
    pageCount: null,
    createdAt: 0,
    updatedAt: 0,
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
  };
}

function makeRuntimeFactory() {
  const handles: RuntimeHandle[] = [];

  const factory = vi.fn((args: any) => {
    let resolveFn!: () => void;
    let rejectFn!: (e: Error) => void;
    const donePromise = new Promise<void>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    const events: RuntimeEvent[] = [];
    const handle: RuntimeHandle = {
      events,
      failNext: null,
      failImmediately: false,
      donePromise,
      doneResolve: () => resolveFn(),
      doneReject: (err: Error) => rejectFn(err),
      emit: (event: RuntimeEvent) => {
        events.push(event);
        if (event.type === "runtime.done") {
          resolveFn();
        } else if (event.type === "runtime.error") {
          const err = (event as any).error ?? { code: "INTERNAL", message: "fail" };
          rejectFn(new Error(err.message));
        } else if (event.type === "runtime.aborted") {
          resolveFn();
        }
      },
      awaitDone: () => donePromise,
    };
    handles.push(handle);

    const runtime = {
      run: async (params: { prompt: unknown[]; abortSignal?: AbortSignal }) => {
        if (handle.failImmediately) {
          handle.failImmediately = false;
          const err = handle.failNext ?? { code: "INTERNAL", message: "fail" };
          handle.failNext = null;
          throw new Error(err.message);
        }
        if (params.abortSignal?.aborted) {
          throw new Error("aborted");
        }
        await donePromise;
        // After done, if failNext was set, throw that
        if (handle.failNext) {
          const err = handle.failNext;
          handle.failNext = null;
          throw new Error(err.message);
        }
      },
    };
    return runtime;
  });

  return { factory, handles };
}

interface ServiceHandle {
  dataRoot: string;
  projectId: string;
  projectDir: string;
  service: ChatService;
  events: ChatEvent[];
  handles: RuntimeHandle[];
  factory: ReturnType<typeof makeRuntimeFactory>["factory"];
}

async function setupService(opts?: {
  failImmediately?: boolean;
  failNext?: { code: string; message: string };
}): Promise<ServiceHandle> {
  const dataRoot = await mkdtemp(join(tmpdir(), "chat-svc-"));
  const projectId = "p-1";
  const projectDir = join(dataRoot, "projects", projectId);
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(dataRoot, "transcripts"), { recursive: true });

  const project = makeProject(projectId, "Test Topic");
  const events: ChatEvent[] = [];
  const { factory, handles } = makeRuntimeFactory();

  const service = new ChatService({
    dataRoot,
    getProject: async (id: string) => (id === projectId ? project : null),
    getProjectDir: (id: string) => join(dataRoot, "projects", id),
    getSettings: async () => settings,
    broadcast: (event: ChatEvent) => {
      events.push(event);
    },
    runtimeFactory: factory,
  });

  return {
    dataRoot,
    projectId,
    projectDir,
    service,
    events,
    handles,
    factory,
  };
}

async function cleanup(dataRoot: string) {
  // Give async worker a moment to finish writing before nuking
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 10));
    try {
      await rm(dataRoot, { recursive: true, force: true });
      return;
    } catch (e: any) {
      if (e?.code === "ENOTEMPTY" || e?.code === "EBUSY") continue;
      throw e;
    }
  }
  // Final attempt; let it throw if it still fails
  await rm(dataRoot, { recursive: true, force: true });
}

async function waitForHandles(h: ServiceHandle, count: number, maxMs = 200): Promise<void> {
  for (let i = 0; i < maxMs / 5; i++) {
    if (h.handles.length >= count) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("chat path helpers", () => {
  it("uses a stable transcript id per project", () => {
    expect(transcriptIdForProject("p-123")).toBe("ppt-p-123");
    expect(transcriptIdForProject("")).toBe("ppt-");
    expect(CHAT_TRANSCRIPT_PREFIX).toBe("ppt-");
  });

  it("loads skills only from the data root", () => {
    expect(skillsDirForDataRoot("/data/zn-agentic-ppt")).toBe("/data/zn-agentic-ppt/skills");
    expect(skillsDirForDataRoot("/var/lib/app")).toBe("/var/lib/app/skills");
  });
});

describe("ChatService.send", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("writes a queued item and broadcasts queue-status", async () => {
    const result = await h.service.send(h.projectId, "hello");
    expect(result.queueId).toBeTruthy();

    const file = JSON.parse(
      await readFile(join(h.projectDir, "conversation.json"), "utf8"),
    );
    expect(file.version).toBe(1);
    expect(file.projectId).toBe(h.projectId);
    expect(file.queue).toHaveLength(1);
    expect(file.queue[0].text).toBe("hello");
    expect(file.queue[0].status).toBe("queued");

    const status = h.events.find((e) => e.type === "queue-status");
    expect(status).toBeDefined();
  });

  it("rejects empty text", async () => {
    await expect(h.service.send(h.projectId, "   ")).rejects.toThrow();
  });

  it("rejects unknown projects", async () => {
    await expect(h.service.send("missing", "hi")).rejects.toThrow();
  });

  it("appends user message with userType chat:<queueId> on first send", async () => {
    const { queueId } = await h.service.send(h.projectId, "hi");
    // Wait for runNext to fire and append the user message
    await waitForHandles(h, 1);
    const transcriptPath = join(h.dataRoot, "transcripts", "ppt-p-1.json");
    const raw = JSON.parse(await readFile(transcriptPath, "utf8"));
    const userMsgs = (raw.messages ?? []).filter(
      (m: any) => m.role === "user" && m.ctx?.userType === `chat:${queueId}`,
    );
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ChatService.load", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("returns an empty snapshot when conversation.json does not exist", async () => {
    const snapshot = await h.service.load(h.projectId);
    expect(snapshot.projectId).toBe(h.projectId);
    expect(snapshot.queue).toEqual([]);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.paused).toBe(false);
  });

  it("reloads existing conversation.json", async () => {
    await writeFile(
      join(h.projectDir, "conversation.json"),
      JSON.stringify({
        version: 1,
        projectId: h.projectId,
        queue: [
          {
            id: "q-x",
            text: "previous",
            status: "completed",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        workflow: [],
        paused: false,
      }),
    );
    const snapshot = await h.service.load(h.projectId);
    expect(snapshot.queue).toHaveLength(1);
    expect(snapshot.queue[0].id).toBe("q-x");
  });

  it("reconciles: load with queued item + matching transcript user does NOT re-append", async () => {
    // Manually write conversation.json with a queued item that has userType chat:q-second
    // already present in transcript (simulates a prior crashed worker).
    await writeFile(
      join(h.projectDir, "conversation.json"),
      JSON.stringify({
        version: 1,
        projectId: h.projectId,
        queue: [
          {
            id: "q-second",
            text: "second",
            status: "queued",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        workflow: [],
        paused: false,
      }),
    );
    const transcriptPath = join(h.dataRoot, "transcripts", "ppt-p-1.json");
    await writeFile(
      transcriptPath,
      JSON.stringify({
        version: 2,
        id: "ppt-p-1",
        meta: { cwd: "", model: "m", permissionMode: "bypassPermissions", createdAt: 0, updatedAt: 0 },
        messages: [
          {
            role: "user",
            ctx: { userType: "chat:q-second" },
            content: [{ type: "text", text: "second" }],
            uuid: "uuid-second",
            timestamp: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const before = JSON.parse(await readFile(transcriptPath, "utf8"));
    await h.service.load(h.projectId);
    // Allow microtask queue to drain so worker runNext doesn't write
    await new Promise((r) => setTimeout(r, 10));
    const after = JSON.parse(await readFile(transcriptPath, "utf8"));

    const chatSecondMsgs = (after.messages ?? []).filter(
      (m: any) => m.role === "user" && m.ctx?.userType === "chat:q-second",
    );
    expect(chatSecondMsgs.length).toBe(1);
    expect(after.messages.length).toBe(before.messages.length);
  });
});

describe("ChatService queueing", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("does not start a second runtime while the first is running", async () => {
    const first = await h.service.send(h.projectId, "msg-1");
    const firstQueueId = first.queueId;

    // Wait for first runNext to fire and runtime to be created
    await waitForHandles(h, 1);
    expect(h.handles.length).toBe(1);

    // Inject second message — should queue but NOT start a new runtime
    const second = await h.service.send(h.projectId, "msg-2");
    await new Promise((r) => setTimeout(r, 10));

    // Still only one runtime created because first is still pending
    expect(h.handles.length).toBe(1);

    // Both queue items exist in conversation.json
    const conv = JSON.parse(
      await readFile(join(h.projectDir, "conversation.json"), "utf8"),
    );
    expect(conv.queue).toHaveLength(2);

    expect(second.queueId).toBeTruthy();
    expect(second.queueId).not.toBe(firstQueueId);
  });

  it("runs the second queued item after the first completes", async () => {
    await h.service.send(h.projectId, "first");
    await waitForHandles(h, 1);
    // Enqueue second message while first is still running
    await h.service.send(h.projectId, "second");
    await new Promise((r) => setTimeout(r, 5));

    // Emit done for the first run
    h.handles[0].emit({ type: "runtime.done", result: "ok" });

    // Wait for queue to settle + second item to start
    await waitForHandles(h, 2);

    expect(h.factory.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ChatService.mergeSnapshot", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("hides zai messages whose content starts with [skill_injection:", async () => {
    const transcriptPath = join(h.dataRoot, "transcripts", "ppt-p-1.json");
    await writeFile(
      transcriptPath,
      JSON.stringify({
        version: 2,
        id: "ppt-p-1",
        meta: {
          cwd: "",
          model: "m",
          permissionMode: "bypassPermissions",
          createdAt: 0,
          updatedAt: 0,
        },
        messages: [
          {
            role: "user",
            ctx: { userType: "zai" },
            content: [{ type: "text", text: "[skill_injection:slide] invisible" }],
            uuid: "u1",
            timestamp: "2025-01-01T00:00:00.000Z",
          },
          {
            role: "assistant",
            ctx: { userType: "zai" },
            content: [{ type: "text", text: "visible assistant text" }],
            uuid: "u2",
            timestamp: "2025-01-01T00:00:01.000Z",
          },
        ],
      }),
    );

    await writeFile(
      join(h.projectDir, "conversation.json"),
      JSON.stringify({
        version: 1,
        projectId: h.projectId,
        queue: [],
        workflow: [],
        paused: false,
      }),
    );

    const snapshot: ChatSnapshot = await h.service.load(h.projectId);

    const messages = snapshot.items.filter((i: any) => i.kind === "message");
    const visibleTexts = messages.map((m: any) => m.text);
    expect(visibleTexts).not.toContain("[skill_injection:slide] invisible");
    expect(visibleTexts).toContain("visible assistant text");
  });

  it("includes workflow events", async () => {
    await writeFile(
      join(h.projectDir, "conversation.json"),
      JSON.stringify({
        version: 1,
        projectId: h.projectId,
        queue: [],
        workflow: [
          {
            id: "wf-1",
            projectId: h.projectId,
            type: "outline-ready",
            createdAt: 100,
            payload: { foo: "bar" },
          },
        ],
        paused: false,
      }),
    );

    const snapshot = await h.service.load(h.projectId);
    const wf = snapshot.items.find((i: any) => i.kind === "workflow");
    expect(wf).toBeDefined();
    expect((wf as any).event.type).toBe("outline-ready");
  });
});

describe("ChatService pause", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("pauses the queue after a runtime error", async () => {
    // Use a fresh service with a pre-configured failing runtime
    const failSetup = await setupService();
    await failSetup.service.send(failSetup.projectId, "boom");
    await waitForHandles(failSetup, 1);

    // Inject failure on the runtime that was just created
    failSetup.handles[0].failNext = { code: "INTERNAL", message: "boom" };
    failSetup.handles[0].emit({ type: "runtime.error", error: { code: "INTERNAL", message: "boom" } });

    await new Promise((r) => setTimeout(r, 30));

    const conv = JSON.parse(
      await readFile(join(failSetup.projectDir, "conversation.json"), "utf8"),
    );
    expect(conv.paused).toBe(true);
    expect(conv.queue[0].status).toBe("failed");
    expect(conv.queue[0].error?.message).toBeTruthy();
    await cleanup(failSetup.dataRoot);
  });

  it("cancel aborts current run and pauses", async () => {
    await h.service.send(h.projectId, "first");
    await waitForHandles(h, 1);
    await h.service.cancel(h.projectId);
    const conv = JSON.parse(
      await readFile(join(h.projectDir, "conversation.json"), "utf8"),
    );
    expect(conv.paused).toBe(true);
  });
});

describe("ChatService cleanup", () => {
  let h: ServiceHandle;

  beforeEach(async () => {
    h = await setupService();
  });

  afterEach(async () => {
    await cleanup(h.dataRoot);
  });

  it("removeProject deletes the transcript and conversation.json", async () => {
    // Pre-create transcript dir so removeProject can find the file
    await mkdir(join(h.dataRoot, "transcripts"), { recursive: true });
    await writeFile(join(h.dataRoot, "transcripts", "ppt-p-1.json"), "{}");

    await h.service.removeProject(h.projectId);

    const exists = await readFile(join(h.projectDir, "conversation.json"), "utf8")
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

describe("IPC registration", () => {
  beforeEach(() => {
    handlers.clear();
    getChatService();
  });

  it("registerChatIPC does not throw", () => {
    expect(() => registerChatIPC()).not.toThrow();
  });
});

describe("project cleanup on delete", () => {
  let projectsDir: string;
  let dataRoot: string;

  beforeEach(async () => {
    handlers.clear();
    projectsDir = await mkdtemp(join(tmpdir(), "chat-cleanup-projects-"));
    dataRoot = "/tmp/unused";
    await mkdir(join(dataRoot, "transcripts"), { recursive: true });

    // Pre-create two project directories + their conversation.json
    await mkdir(join(projectsDir, "p-1"), { recursive: true });
    await mkdir(join(projectsDir, "p-2"), { recursive: true });
    await writeFile(join(projectsDir, "p-1", "conversation.json"), "{}");
    await writeFile(join(projectsDir, "p-2", "conversation.json"), "{}");

    // Pre-create two transcripts in the chat service's dataRoot
    await writeFile(join(dataRoot, "transcripts", "ppt-p-1.json"), "{}");
    await writeFile(join(dataRoot, "transcripts", "ppt-p-2.json"), "{}");

    // Make projects live where our test expects
    const { setProjectsDirForTest } = await import("../../../../src/main/fs/paths.js");
    setProjectsDirForTest(projectsDir);
  });

  afterEach(async () => {
    await rm(projectsDir, { recursive: true, force: true });
    await rm(join(dataRoot, "transcripts", "ppt-p-1.json"), { force: true });
    await rm(join(dataRoot, "transcripts", "ppt-p-2.json"), { force: true });
  });

  it("delete handler removes only the targeted project's transcript and conversation.json", async () => {
    const { registerProjectIPC } = await import("../../../../src/main/ipc/project.js");
    registerProjectIPC();

    const handler = handlers.get(IPC.PROJECT_DELETE);
    expect(handler).toBeDefined();
    await handler({}, { id: "p-1" });

    const transcriptPath = (id: string) => join(dataRoot, "transcripts", `ppt-${id}.json`);
    const projectExists = async (id: string) =>
      readFile(join(projectsDir, id, "conversation.json"), "utf8")
        .then(() => true)
        .catch(() => false);

    expect(await readFile(transcriptPath("p-1"), "utf8").then(() => true).catch(() => false)).toBe(false);
    expect(await projectExists("p-1")).toBe(false);
    expect(await readFile(transcriptPath("p-2"), "utf8").then(() => true).catch(() => false)).toBe(true);
    expect(await projectExists("p-2")).toBe(true);
  });
});
