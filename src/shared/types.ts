export type ProjectStatus = "draft" | "generated" | "failed";

export interface ProjectMeta {
  id: string;
  title: string;
  topic: string;
  status: ProjectStatus;
  outline: string;
  pageCount: number | null;
  createdAt: number;
  updatedAt: number;
  currentStage: "collect" | "outline" | "generate" | "fine-tune" | "idle";
  hasSource: boolean;
  hasOutline: boolean;
  hasHtml: boolean;
}

export interface ProjectDetail extends ProjectMeta {
  // Legacy
  html: string | null;
  htmlSize: number | null;
  lastGeneratedAt: number | null;
  lastError: string | null;
  // Stage 1
  source: string | null;
  brief: ProjectBrief | null;
  // Stage 2 (structured; ProjectMeta.outline remains legacy markdown)
  structuredOutline: Outline | null;
  /** Whether intent.json exists on disk (set by STAGE_INTENT_GENERATE). */
  hasIntent: boolean;
  // Stage 3
  style: StyleSettings | null;
  slides: Array<{
    id: string;
    html: string;
    layout?: 1 | 2 | 3 | 4 | 5;
    status: "done" | "failed";
    error?: string;
  }>;
}

export type LLMProvider = "anthropic" | "openai" | "custom";

export const OPEN_PLATFORM_BASE_URL = "https://zn-nova.paic.com.cn/novai";
export const OPEN_PLATFORM_CREDENTIAL_PATH = "~/.nova/openAuth2.json";

export interface LLMSettings {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  useOpenPlatform: boolean;
}

export interface Settings {
  llm: LLMSettings;
  ui: { theme: "light" | "dark" };
  paths: { projectsDir: string };
  /** Optional per-prompt overrides keyed by prompt id. Undefined / missing key = use spec default. */
  prompts?: Record<string, string>;
}

export type AppErrorCode = "AUTH" | "NETWORK" | "RATE_LIMIT" | "PARSE" | "DISK" | "INTERNAL";

export interface AppError {
  code: AppErrorCode;
  message: string;
  detail?: string;
  retryable: boolean;
}

// ── PPT wizard types ───────────────────────────────────────────────────────────

/** Semantic layout archetypes the outline LLM picks per slide.
 * Orchestrator maps these to visual layouts (1-5) in `slide.layout`. */
export type SlideLayoutKind =
  | "cover" // 大标题封面 — layout-1 hero
  | "list" // 卡片列表 — layout-2 cards
  | "columns" // 左右分栏对比 — layout-3 split
  | "stats" // 大数字/KPI — layout-4 neon stats
  | "quote" // 居中引言 — layout-5 vintage quote
  | "closing"; // 结尾页（致谢/Q&A） — layout-5 quote

export interface OutlineSlide {
  id: string;
  title: string;
  bullets: string[];
  notes?: string;
  /** Suggested semantic layout. Orchestrator maps this to numeric
   * `slide.layout` (1-5) and uses it for the visual style. */
  layout?: SlideLayoutKind;
}

/** Global style info returned by the outline LLM. The orchestrator
 * passes this through to slide generation so every page stays consistent. */
export interface OutlineGlobalStyle {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  aspectRatio?: string;
}

export interface Outline {
  slides: OutlineSlide[];
  generatedAt: number;
  /** Optional global style the LLM chose (kept here so regenerate produces
   * a consistent visual identity across all slides). */
  globalStyle?: OutlineGlobalStyle;
}

export interface StyleSettings {
  primaryColor: string;
  layout: "minimal" | "fullbg" | "columns";
  fontFamily: string;
}

export const DEFAULT_STYLE: StyleSettings = {
  primaryColor: "#FF6600",
  layout: "minimal",
  fontFamily: "-apple-system, sans-serif",
};

export interface ProjectBrief {
  /** Raw markdown text returned by the LLM (or edited by the user). */
  markdown: string;
}

// ── Chat conversation types ──────────────────────────────────────────────────

export type ChatQueueStatus =
  | "queued"
  | "submitted"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChatQueueItem {
  id: string;
  text: string;
  status: ChatQueueStatus;
  createdAt: number;
  updatedAt: number;
  transcriptUuid?: string;
  error?: { code: string; message: string; retryable: boolean };
}

export type ChatWorkflowEventType =
  | "project-created"
  | "brief-confirmed"
  | "sources-confirmed"
  | "outline-ready"
  | "outline-confirmed"
  | "generation-started"
  | "generation-completed"
  | "generation-failed"
  | "generation-cancelled"
  | "revision-requested"
  | "revision-completed";

export interface ChatWorkflowEvent {
  id: string;
  projectId: string;
  type: ChatWorkflowEventType;
  createdAt: number;
  payload: Record<string, unknown>;
}

export type ChatTimelineItem =
  | {
      kind: "message";
      id: string;
      projectId: string;
      role: "user" | "assistant";
      text: string;
      createdAt: number;
      queueId?: string;
    }
  | {
      kind: "tool";
      id: string;
      projectId: string;
      toolUseId: string;
      name: string;
      input: unknown;
      output?: unknown;
      status: "running" | "done" | "error" | "denied";
      createdAt: number;
      finishedAt?: number;
    }
  | { kind: "workflow"; event: ChatWorkflowEvent }
  | { kind: "queue"; queue: ChatQueueItem };

export interface ChatSnapshot {
  projectId: string;
  items: ChatTimelineItem[];
  queue: ChatQueueItem[];
  paused: boolean;
  pauseReason?: string;
}

export type ChatEvent =
  | { type: "snapshot"; projectId: string; snapshot: ChatSnapshot }
  | { type: "assistant-delta"; projectId: string; queueId: string; text: string }
  | {
      type: "tool-start";
      projectId: string;
      queueId: string;
      toolUseId: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool-done";
      projectId: string;
      queueId: string;
      toolUseId: string;
      output: unknown;
    }
  | {
      type: "tool-error";
      projectId: string;
      queueId: string;
      toolUseId: string;
      error: string;
    }
  | {
      type: "queue-status";
      projectId: string;
      item: ChatQueueItem;
      paused: boolean;
      pauseReason?: string;
    }
  | { type: "project-changed"; projectId: string };
