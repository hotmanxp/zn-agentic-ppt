import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type {
  ChatEvent,
  ChatQueueItem,
  ChatQueueStatus,
  ChatSnapshot,
  ChatTimelineItem,
  ChatWorkflowEvent,
  ChatWorkflowEventType,
  ProjectDetail,
  Settings,
} from "../../shared/types.js";
import * as projectFs from "../fs/projects.js";
import { getProjectDir } from "../fs/paths.js";
import * as settingsFs from "../fs/settings.js";

export const CHAT_TRANSCRIPT_PREFIX = "ppt-";

export function transcriptIdForProject(projectId: string): string {
  return `${CHAT_TRANSCRIPT_PREFIX}${projectId}`;
}

export function skillsDirForDataRoot(dataRoot: string): string {
  return join(dataRoot, "skills");
}

// ──────────────────────────────────────────────────────────────────────────────
// Local TranscriptStore — minimal real implementation backed by node:fs/promises.
// Backed by a single JSON file per transcript at <dataRoot>/transcripts/<id>.json.
// Mirrors the contract required by ChatService: read, create, appendUserMessageV2.
// ──────────────────────────────────────────────────────────────────────────────

interface TranscriptMeta {
  cwd: string;
  model: string;
  permissionMode: string;
  createdAt?: number;
  updatedAt?: number;
}

interface TranscriptMessageBlock {
  type: "text";
  text: string;
}

interface TranscriptMessage {
  role: "user" | "assistant" | "system";
  content: TranscriptMessageBlock[];
  ctx?: Record<string, unknown>;
  uuid: string;
  parentUuid?: string | null;
  timestamp: string;
}

interface TranscriptFile {
  version: 2;
  id: string;
  meta: TranscriptMeta;
  messages: TranscriptMessage[];
}

export class TranscriptStore {
  constructor(private dataRoot: string) {}

  private filePath(id: string): string {
    return join(this.dataRoot, "transcripts", `${id}.json`);
  }

  async read(id: string): Promise<TranscriptFile> {
    const p = this.filePath(id);
    if (!existsSync(p)) {
      throw new Error(`transcript ${id} not found`);
    }
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as TranscriptFile;
  }

  async create(id: string, meta: TranscriptMeta): Promise<TranscriptFile> {
    const now = Date.now();
    const file: TranscriptFile = {
      version: 2,
      id,
      meta: { ...meta, createdAt: now, updatedAt: now },
      messages: [],
    };
    await mkdir(join(this.dataRoot, "transcripts"), { recursive: true });
    await writeFile(this.filePath(id), JSON.stringify(file));
    return file;
  }

  async readOrCreate(id: string, meta: TranscriptMeta): Promise<TranscriptFile> {
    try {
      return await this.read(id);
    } catch {
      return await this.create(id, meta);
    }
  }

  async write(file: TranscriptFile): Promise<void> {
    file.meta.updatedAt = Date.now();
    await mkdir(join(this.dataRoot, "transcripts"), { recursive: true });
    const p = this.filePath(file.id);
    const tmp = `${p}.tmp`;
    await writeFile(tmp, JSON.stringify(file));
    await rename(tmp, p);
  }

  async appendUserMessageV2(
    id: string,
    text: string,
    ctx: { userType: string },
  ): Promise<string> {
    const file = await this.readOrCreate(id, {
      cwd: "",
      model: "",
      permissionMode: "bypassPermissions",
    });
    const uuid = randomUUID();
    const parentUuid = file.messages[file.messages.length - 1]?.uuid ?? null;
    file.messages.push({
      role: "user",
      content: [{ type: "text", text }],
      ctx: { ...ctx },
      uuid,
      parentUuid,
      timestamp: new Date().toISOString(),
    });
    await this.write(file);
    return uuid;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Bridge tools — empty placeholder for now. Tools register through additionalTools
// parameter on runtime.run, but the local stub runtime ignores it.
// ──────────────────────────────────────────────────────────────────────────────

export const BRIDGE_TOOLS: unknown[] = [];

// ──────────────────────────────────────────────────────────────────────────────
// Runtime factory contract — minimal AgentRuntime interface used by ChatService.
// Tests inject a fake via runtimeFactory; production code uses DefaultAgentRuntime.
// ──────────────────────────────────────────────────────────────────────────────

export interface AgentRuntime {
  run(params: {
    prompt: unknown[];
    transcriptId?: string;
    cwd?: string;
    model?: string;
    maxTurns?: number;
    toolsOverride?: string;
    additionalTools?: unknown[];
    skillsDirs?: string[];
    abortSignal?: AbortSignal;
  }): Promise<void>;
}

export interface ModelCaller {
  call(model: string, messages: unknown[], opts: unknown): Promise<unknown>;
}

export function createModelCaller(opts: {
  baseUrl: string;
  apiKey: string;
}): ModelCaller {
  return {
    async call(_model: string, _messages: unknown[], _callOpts: unknown) {
      // Production wiring lives in a future task; this factory exists so the
      // ChatService IPC registration can pass a valid modelCaller into
      // DefaultAgentRuntime without leaking implementation details.
      throw new Error("createModelCaller: no real LLM caller wired yet");
    },
  };
}

export interface DefaultAgentRuntimeOptions {
  dataDir: string;
  defaultModel: string;
  defaultMaxTurns?: number;
  defaultPermissionMode?: "default" | "bypassPermissions";
  skillsDirs: string[];
  modelCaller: ModelCaller;
}

/**
 * Minimal DefaultAgentRuntime stub. The full agent runtime (with tool
 * permissions, skill loading, transcript wiring, etc.) lives in a future
 * task. For Task 2 the runtime is only used in production via the
 * runtimeFactory closure — the chat IPC tests inject a fake. The shape
 * matches what the brief calls for so the production wiring can drop in
 * later without changing ChatService.
 */
export class DefaultAgentRuntime implements AgentRuntime {
  constructor(private readonly opts: DefaultAgentRuntimeOptions) {}

  async run(params: {
    prompt: unknown[];
    transcriptId?: string;
    cwd?: string;
    model?: string;
    maxTurns?: number;
    toolsOverride?: string;
    additionalTools?: unknown[];
    skillsDirs?: string[];
    abortSignal?: AbortSignal;
  }): Promise<void> {
    // Production runtime will delegate to the underlying SDK. Until that
    // wiring lands, surface a clear error so a misconfigured production
    // call fails loudly instead of silently doing nothing.
    throw new Error(
      "DefaultAgentRuntime.run is not yet wired to the underlying SDK; production chat IPC is disabled",
    );
  }
}

export function createDefaultRuntimeFactory(): (args: RuntimeFactoryArgs) => AgentRuntime {
  return (args) =>
    new DefaultAgentRuntime({
      dataDir: args.dataRoot,
      defaultModel: args.settings.llm.model,
      defaultMaxTurns: 10,
      defaultPermissionMode: "bypassPermissions",
      skillsDirs: [args.skillsDir],
      modelCaller: createModelCaller({
        baseUrl: args.settings.llm.baseUrl,
        apiKey: args.settings.llm.apiKey,
      }),
    });
}

export interface RuntimeFactoryArgs {
  dataRoot: string;
  projectDir: string;
  settings: Settings;
  skillsDir: string;
  abortSignal: AbortSignal;
}

export interface ChatServiceOptions {
  dataRoot: string;
  getProject: (id: string) => Promise<ProjectDetail | null>;
  getProjectDir: (id: string) => string;
  getSettings: () => Promise<Settings>;
  broadcast: (event: ChatEvent) => void;
  runtimeFactory?: (args: RuntimeFactoryArgs) => AgentRuntime;
}

interface ConversationFile {
  version: 1;
  projectId: string;
  queue: ChatQueueItem[];
  workflow: ChatWorkflowEvent[];
  paused: boolean;
  pauseReason?: string;
}

interface ProjectWorkerState {
  running: boolean;
  currentQueueId: string | null;
  abortController: AbortController | null;
  paused: boolean;
}

const WORKFLOW_WHITELIST: ChatWorkflowEventType[] = [
  "project-created",
  "brief-confirmed",
  "sources-confirmed",
  "outline-ready",
  "outline-confirmed",
  "generation-started",
  "generation-completed",
  "generation-failed",
  "generation-cancelled",
  "revision-requested",
  "revision-completed",
];

function emptyConversation(projectId: string): ConversationFile {
  return {
    version: 1,
    projectId,
    queue: [],
    workflow: [],
    paused: false,
  };
}

export class ChatService {
  private store = new Map<string, ConversationFile>();
  private writeChains = new Map<string, Promise<void>>();
  private workers = new Map<string, ProjectWorkerState>();
  private opts: ChatServiceOptions;

  constructor(options: ChatServiceOptions) {
    this.opts = options;
  }

  private transcriptIdFor(projectId: string): string {
    return transcriptIdForProject(projectId);
  }

  private conversationPath(projectId: string): string {
    return join(this.opts.getProjectDir(projectId), "conversation.json");
  }

  private async readConversation(projectId: string): Promise<ConversationFile> {
    const cached = this.store.get(projectId);
    if (cached) return cached;
    const p = this.conversationPath(projectId);
    if (!existsSync(p)) {
      const empty = emptyConversation(projectId);
      this.store.set(projectId, empty);
      return empty;
    }
    try {
      const raw = await readFile(p, "utf8");
      const file = JSON.parse(raw) as ConversationFile;
      if (file.version !== 1) throw new Error(`unsupported conversation version ${file.version}`);
      if (file.projectId !== projectId) {
        throw new Error(
          `conversation projectId mismatch: file=${file.projectId} expected=${projectId}`,
        );
      }
      if (!Array.isArray(file.queue)) file.queue = [];
      if (!Array.isArray(file.workflow)) file.workflow = [];
      if (typeof file.paused !== "boolean") file.paused = false;
      this.store.set(projectId, file);
      return file;
    } catch (e) {
      throw e;
    }
  }

  private writeConversation(projectId: string, file: ConversationFile): Promise<void> {
    const prev = this.writeChains.get(projectId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const p = this.conversationPath(projectId);
      const tmp = `${p}.tmp`;
      await writeFile(tmp, JSON.stringify(file, null, 2));
      await rename(tmp, p);
    });
    this.writeChains.set(projectId, next.catch(() => {}));
    return next;
  }

  private async ensureTranscript(projectId: string, cwd: string, model: string): Promise<void> {
    const id = this.transcriptIdFor(projectId);
    const store = new TranscriptStore(this.opts.dataRoot);
    try {
      await store.read(id);
    } catch {
      await store.create(id, { cwd, model, permissionMode: "bypassPermissions" });
    }
  }

  private async hasUserMessageFor(
    projectId: string,
    userType: string,
  ): Promise<boolean> {
    const id = this.transcriptIdFor(projectId);
    const store = new TranscriptStore(this.opts.dataRoot);
    let file: TranscriptFile;
    try {
      file = await store.read(id);
    } catch {
      return false;
    }
    return file.messages.some(
      (m) => m.role === "user" && (m.ctx as any)?.userType === userType,
    );
  }

  private isSkillInjection(msg: TranscriptMessage): boolean {
    if (msg.role !== "user") return false;
    if ((msg.ctx as any)?.userType !== "zai") return false;
    const first = msg.content?.[0];
    if (!first || first.type !== "text") return false;
    return first.text.startsWith("[skill_injection:");
  }

  private async buildSnapshot(projectId: string): Promise<ChatSnapshot> {
    const conv = await this.readConversation(projectId);
    const id = this.transcriptIdFor(projectId);
    const items: ChatTimelineItem[] = [];

    // Read transcript
    const store = new TranscriptStore(this.opts.dataRoot);
    let transcriptMsgs: TranscriptMessage[] = [];
    try {
      const file = await store.read(id);
      transcriptMsgs = file.messages;
    } catch {
      transcriptMsgs = [];
    }

    // Walk transcript and convert to timeline messages + tool pairs
    for (const m of transcriptMsgs) {
      if (this.isSkillInjection(m)) continue;

      if (m.role === "user" || m.role === "assistant") {
        const text = (m.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (!text) continue;
        // Only surface messages with non-zai userType OR assistant with text
        const userType = (m.ctx as any)?.userType;
        if (m.role === "user" && userType === "zai") {
          // Skip zai user messages that aren't skill injection (keep model output)
        }
        const item: ChatTimelineItem = {
          kind: "message",
          id: m.uuid,
          projectId,
          role: m.role,
          text,
          createdAt: Date.parse(m.timestamp) || Date.now(),
          ...(userType && userType.startsWith("chat:")
            ? { queueId: userType.slice("chat:".length) }
            : {}),
        };
        items.push(item);
      }
    }

    // Workflow events
    for (const ev of conv.workflow) {
      items.push({ kind: "workflow", event: ev });
    }

    // Queue items
    for (const q of conv.queue) {
      items.push({ kind: "queue", queue: q });
    }

    items.sort((a, b) => {
      const ta = "createdAt" in a ? a.createdAt : "event" in a ? a.event.createdAt : "queue" in a ? a.queue.createdAt : 0;
      const tb = "createdAt" in b ? b.createdAt : "event" in b ? b.event.createdAt : "queue" in b ? b.queue.createdAt : 0;
      return ta - tb;
    });

    return {
      projectId,
      items,
      queue: conv.queue,
      paused: conv.paused,
      pauseReason: conv.pauseReason,
    };
  }

  private emitQueueStatus(projectId: string, item: ChatQueueItem, conv: ConversationFile) {
    this.opts.broadcast({
      type: "queue-status",
      projectId,
      item,
      paused: conv.paused,
      pauseReason: conv.pauseReason,
    });
  }

  private async setItemStatus(
    projectId: string,
    queueId: string,
    patch: Partial<ChatQueueItem>,
  ): Promise<ChatQueueItem | null> {
    const conv = await this.readConversation(projectId);
    const idx = conv.queue.findIndex((q) => q.id === queueId);
    if (idx === -1) return null;
    const next: ChatQueueItem = {
      ...conv.queue[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    conv.queue[idx] = next;
    await this.writeConversation(projectId, conv);
    this.emitQueueStatus(projectId, next, conv);
    return next;
  }

  async load(projectId: string): Promise<ChatSnapshot> {
    const conv = await this.readConversation(projectId);
    const snapshot = await this.buildSnapshot(projectId);

    // Reconcile queue statuses against transcript presence
    for (const q of conv.queue) {
      const userType = `chat:${q.id}`;
      const hasUser = await this.hasUserMessageFor(projectId, userType);
      if (q.status === "running" || q.status === "submitted") {
        if (!hasUser) {
          // user message not yet appended; reset to queued so runNext picks it up
          q.status = "queued";
        }
      }
    }

    // Snapshot already returned. Now maybe start a worker if not running and not paused.
    let worker = this.workers.get(projectId);
    if (!worker) {
      worker = { running: false, currentQueueId: null, abortController: null, paused: conv.paused };
      this.workers.set(projectId, worker);
    }

    if (!conv.paused && !worker.running) {
      void this.runNext(projectId).catch(() => {});
    }

    return snapshot;
  }

  async send(projectId: string, text: string): Promise<{ queueId: string }> {
    const trimmed = text?.trim();
    if (!trimmed) throw new Error("empty message");
    const project = await this.opts.getProject(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    const conv = await this.readConversation(projectId);
    const now = Date.now();
    const item: ChatQueueItem = {
      id: randomUUID(),
      text: trimmed,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    conv.queue.push(item);
    await this.writeConversation(projectId, conv);
    this.emitQueueStatus(projectId, item, conv);

    let worker = this.workers.get(projectId);
    if (!worker) {
      worker = { running: false, currentQueueId: null, abortController: null, paused: conv.paused };
      this.workers.set(projectId, worker);
    }
    if (!worker.running && !conv.paused) {
      void this.runNext(projectId).catch(() => {});
    }

    return { queueId: item.id };
  }

  async cancel(projectId: string): Promise<{ ok: boolean }> {
    const worker = this.workers.get(projectId);
    if (worker?.abortController) {
      worker.abortController.abort();
    }
    const conv = await this.readConversation(projectId);
    conv.paused = true;
    conv.pauseReason = "user-cancelled";
    if (worker?.currentQueueId) {
      const idx = conv.queue.findIndex((q) => q.id === worker.currentQueueId);
      if (idx !== -1 && conv.queue[idx].status !== "completed") {
        conv.queue[idx] = { ...conv.queue[idx], status: "cancelled", updatedAt: Date.now() };
        this.emitQueueStatus(projectId, conv.queue[idx], conv);
      }
    }
    if (worker) worker.paused = true;
    await this.writeConversation(projectId, conv);
    return { ok: true };
  }

  async retry(projectId: string, queueId: string): Promise<void> {
    const conv = await this.readConversation(projectId);
    const item = conv.queue.find((q) => q.id === queueId);
    if (!item) throw new Error("queue item not found");
    if (item.status !== "failed" && item.status !== "cancelled") {
      throw new Error(`cannot retry item in status ${item.status}`);
    }
    item.status = "queued";
    item.error = undefined;
    item.updatedAt = Date.now();
    await this.writeConversation(projectId, conv);
    this.emitQueueStatus(projectId, item, conv);

    let worker = this.workers.get(projectId);
    if (!worker) {
      worker = { running: false, currentQueueId: null, abortController: null, paused: conv.paused };
      this.workers.set(projectId, worker);
    }
    if (!worker.running) {
      worker.paused = false;
      void this.runNext(projectId).catch(() => {});
    }
  }

  async removeQueueItem(projectId: string, queueId: string): Promise<void> {
    const conv = await this.readConversation(projectId);
    const idx = conv.queue.findIndex((q) => q.id === queueId);
    if (idx === -1) return;
    if (conv.queue[idx].status === "running" || conv.queue[idx].status === "submitted") {
      throw new Error("cannot remove running queue item");
    }
    conv.queue.splice(idx, 1);
    await this.writeConversation(projectId, conv);
  }

  async appendWorkflow(
    projectId: string,
    event: Omit<ChatWorkflowEvent, "id" | "projectId" | "createdAt">,
  ): Promise<void> {
    if (!WORKFLOW_WHITELIST.includes(event.type)) {
      throw new Error(`workflow event type not allowed: ${event.type}`);
    }
    const conv = await this.readConversation(projectId);
    const full: ChatWorkflowEvent = {
      id: randomUUID(),
      projectId,
      type: event.type,
      createdAt: Date.now(),
      payload: event.payload ?? {},
    };
    conv.workflow.push(full);
    await this.writeConversation(projectId, conv);
  }

  async removeProject(projectId: string): Promise<void> {
    const worker = this.workers.get(projectId);
    if (worker?.abortController) worker.abortController.abort();
    this.workers.delete(projectId);
    this.store.delete(projectId);
    const convPath = this.conversationPath(projectId);
    try {
      await rm(convPath, { force: true });
    } catch {
      // ignore
    }
    const transcriptPath = join(
      this.opts.dataRoot,
      "transcripts",
      `${this.transcriptIdFor(projectId)}.json`,
    );
    try {
      await rm(transcriptPath, { force: true });
    } catch {
      // ignore
    }
  }

  private async runNext(projectId: string): Promise<void> {
    const conv = await this.readConversation(projectId);
    let worker = this.workers.get(projectId);
    if (!worker) {
      worker = { running: false, currentQueueId: null, abortController: null, paused: conv.paused };
      this.workers.set(projectId, worker);
    }
    if (worker.running) return;
    if (conv.paused) return;
    const next = conv.queue.find((q) => q.status === "queued");
    if (!next) return;

    // Ensure transcript exists
    const projectDir = this.opts.getProjectDir(projectId);
    const settings = await this.opts.getSettings();
    await this.ensureTranscript(projectId, projectDir, settings.llm.model);

    // Append user message if not already present
    const userType = `chat:${next.id}`;
    const already = await this.hasUserMessageFor(projectId, userType);
    let transcriptUuid: string | undefined = next.transcriptUuid;
    if (!already) {
      const store = new TranscriptStore(this.opts.dataRoot);
      transcriptUuid = await store.appendUserMessageV2(
        this.transcriptIdFor(projectId),
        next.text,
        { userType },
      );
    } else {
      // Recover existing UUID
      const store = new TranscriptStore(this.opts.dataRoot);
      try {
        const file = await store.read(this.transcriptIdFor(projectId));
        const found = file.messages.find(
          (m) => m.role === "user" && (m.ctx as any)?.userType === userType,
        );
        transcriptUuid = found?.uuid;
      } catch {
        transcriptUuid = undefined;
      }
    }

    // Mark running
    worker.running = true;
    worker.currentQueueId = next.id;
    worker.abortController = new AbortController();
    await this.setItemStatus(projectId, next.id, {
      status: "running",
      transcriptUuid,
    });

    // Build runtime
    if (!this.opts.runtimeFactory) {
      throw new Error("no runtimeFactory configured");
    }
    const skillsDir = skillsDirForDataRoot(this.opts.dataRoot);
    const runtime = this.opts.runtimeFactory({
      dataRoot: this.opts.dataRoot,
      projectDir,
      settings,
      skillsDir,
      abortSignal: worker.abortController.signal,
    });

    let succeeded = false;
    try {
      await runtime.run({
        prompt: [],
        transcriptId: this.transcriptIdFor(projectId),
        cwd: projectDir,
        model: settings.llm.model,
        maxTurns: 10,
        toolsOverride: "none",
        additionalTools: BRIDGE_TOOLS,
        skillsDirs: [skillsDir],
        abortSignal: worker.abortController.signal,
      });
      succeeded = true;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const code = (e as any)?.code ?? "INTERNAL";
      const retryable = (e as any)?.retryable ?? false;
      await this.setItemStatus(projectId, next.id, {
        status: "failed",
        error: { code, message: msg, retryable },
      });
      conv.paused = true;
      conv.pauseReason = `runtime error: ${msg}`;
      worker.paused = true;
      await this.writeConversation(projectId, conv);
    } finally {
      worker.running = false;
      worker.currentQueueId = null;
      worker.abortController = null;
    }

    if (succeeded) {
      await this.setItemStatus(projectId, next.id, { status: "completed" });
    }

    // Continue if not paused
    if (!worker.paused && !conv.paused) {
      void this.runNext(projectId).catch(() => {});
    } else {
      // Broadcast project-changed snapshot
      const snap = await this.buildSnapshot(projectId);
      this.opts.broadcast({ type: "snapshot", projectId, snapshot: snap });
      this.opts.broadcast({ type: "project-changed", projectId });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Module-level singleton service + IPC registration.
// ──────────────────────────────────────────────────────────────────────────────

let chatService: ChatService | null = null;

export function getChatService(): ChatService {
  if (!chatService) {
    const dataRoot = app.getPath("userData");
    chatService = new ChatService({
      dataRoot,
      getProject: (id) => projectFs.getProject(id),
      getProjectDir: (id) => getProjectDir(id),
      getSettings: () => settingsFs.getSettings(),
      broadcast: (event: ChatEvent) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC.CHAT_EVENT, event);
        }
      },
      runtimeFactory: createDefaultRuntimeFactory(),
    });
  }
  return chatService;
}

export function registerChatIPC(): void {
  const service = getChatService();
  const dataRoot = app.getPath("userData");
  // Ensure skills directory exists
  void mkdir(skillsDirForDataRoot(dataRoot), { recursive: true }).catch(() => {});

  ipcMain.handle(IPC.CHAT_LOAD, async (_, { projectId }: { projectId: string }) => {
    return service.load(projectId);
  });
  ipcMain.handle(
    IPC.CHAT_SEND,
    async (_, { projectId, text }: { projectId: string; text: string }) => {
      return service.send(projectId, text);
    },
  );
  ipcMain.handle(IPC.CHAT_CANCEL, async (_, { projectId }: { projectId: string }) => {
    return service.cancel(projectId);
  });
  ipcMain.handle(
    IPC.CHAT_RETRY,
    async (_, { projectId, queueId }: { projectId: string; queueId: string }) => {
      return service.retry(projectId, queueId);
    },
  );
  ipcMain.handle(
    IPC.CHAT_REMOVE_QUEUE_ITEM,
    async (_, { projectId, queueId }: { projectId: string; queueId: string }) => {
      return service.removeQueueItem(projectId, queueId);
    },
  );
  ipcMain.handle(
    IPC.CHAT_APPEND_WORKFLOW,
    async (
      _,
      {
        projectId,
        event,
      }: {
        projectId: string;
        event: Omit<ChatWorkflowEvent, "id" | "projectId" | "createdAt">;
      },
    ) => {
      return service.appendWorkflow(projectId, event);
    },
  );
}
