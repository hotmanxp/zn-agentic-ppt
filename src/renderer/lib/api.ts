import type {
  ChatEvent,
  ChatSnapshot,
  ChatWorkflowEvent,
  OutlineSlide,
  ProjectBrief,
  ProjectDetail,
  ProjectMeta,
  Settings,
  StyleSettings,
} from "@shared/types";
import type { IntentGenerateResponse, IntentStreamPayload } from "../../shared/ipc-types.js";
import type { IntentSummary } from "../../shared/intent.js";

export type { OutlineSlide };

export interface StageStreamEvent {
  runId: string;
  projectId: string;
  slideId?: string;
  kind: "outline" | "slide-regen";
  phase: "streaming" | "done" | "cancelled" | "error";
  chars: number;
  html?: string;
  error?: { code: string; message: string; retryable: boolean };
}

export interface BridgeApi {
  project: {
    list(): Promise<ProjectMeta[]>;
    get(id: string): Promise<ProjectDetail | null>;
    detail(id: string): Promise<ProjectDetail | null>;
    create(topic: string): Promise<ProjectMeta>;
    update(
      id: string,
      patch: Partial<Pick<ProjectMeta, "title" | "topic" | "outline">>,
    ): Promise<ProjectMeta>;
    delete(id: string): Promise<void>;
    duplicate(id: string): Promise<ProjectMeta>;
    rename(id: string, title: string): Promise<void>;
    reveal(id: string): Promise<void>;
  };
  generation: {
    start(id: string, opts?: object): Promise<{ runId: string }>;
    cancel(runId: string): Promise<void>;
    onEvent(cb: (e: any) => void): () => void;
    onProgress(cb: (e: any) => void): () => void;
    onDone(cb: (e: any) => void): () => void;
    onError(cb: (e: any) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    set(settings: Settings): Promise<void>;
    testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }>;
    prompts: {
      get(id: string): Promise<string | null>;
      set(id: string, template: string): Promise<void>;
      reset(id: string): Promise<void>;
      list(): Promise<Record<string, string>>;
      listSpecs(): Promise<
        Array<{
          id: string;
          title: string;
          description: string;
          defaultTemplate: string;
          variables: Array<{
            name: string;
            description: string;
            type: "string" | "json";
            example?: string;
          }>;
        }>
      >;
    };
  };
  system: {
    userDataPath(): Promise<string>;
  };
  stage: {
    collectSave(id: string, topic: string, source: string, brief: any): Promise<void>;
    outlineGenerate(
      id: string,
    ): Promise<{ phase: "done"; slides: OutlineSlide[] } | { phase: "cancelled" }>;
    outlineRead(id: string): Promise<{ slides: OutlineSlide[]; generatedAt: number } | null>;
    outlineCancel(id: string): Promise<{ ok: boolean }>;
    onOutlineStream(cb: (e: StageStreamEvent) => void): () => void;
    onSlideRegenStream(cb: (e: StageStreamEvent) => void): () => void;
    outlineUpdate(
      id: string,
      slideId: string,
      patch: Partial<OutlineSlide>,
    ): Promise<{ slides: OutlineSlide[] }>;
    slideAdd(id: string): Promise<{ slides: OutlineSlide[] }>;
    slideDelete(id: string, slideId: string): Promise<{ slides: OutlineSlide[] }>;
    slideRegenerate(
      id: string,
      slideId: string,
    ): Promise<{ phase: "done"; html: string; durationMs: number } | { phase: "cancelled" }>;
    slideCancel(id: string, slideId: string): Promise<{ ok: boolean }>;
    layoutGenerate(id: string): Promise<{ written: number; total: number }>;
    htmlGenerate(
      id: string,
    ): Promise<{
      phase: "done" | "cancelled" | "error";
      completed: number;
      failed: number;
      total: number;
      error?: string;
    }>;
    htmlCancel(id: string): Promise<{ ok: boolean }>;
    intentGenerate(id: string): Promise<IntentGenerateResponse>;
    intentCancel(id: string): Promise<{ ok: boolean }>;
    onIntentStream(cb: (e: IntentStreamPayload) => void): () => void;
    styleSave(id: string, style: StyleSettings): Promise<void>;
    onSlideUpdated(
      cb: (e: { projectId: string; slideId: string; html: string }) => void,
    ): () => void;
    onHtmlSlideReady(
      cb: (e: {
        projectId: string;
        slideId: string;
        status: "layout" | "done" | "failed";
        html?: string;
        error?: string;
        durationMs?: number;
        retries?: number;
        layout?: 1 | 2 | 3 | 4 | 5;
        completed: number;
        total: number;
      }) => void,
    ): () => void;
    onHtmlGenerateDone(
      cb: (e: {
        projectId: string;
        completed: number;
        failed: number;
        total: number;
        cancelled: boolean;
      }) => void,
    ): () => void;
  };
  brief: {
    optimize(id: string, hint: ProjectBrief | null): Promise<{ ok: boolean }>;
    cancel(): Promise<{ ok: boolean }>;
    answer(
      qid: string,
      value: { cancelled: boolean; value?: Record<string, string | string[]> },
    ): Promise<{ ok: boolean }>;
    onAskUserQuestion(
      cb: (e: {
        projectId: string;
        qid: string;
        turn: 1 | 2;
        questions: Array<{
          question: string;
          header: string;
          options: Array<{ label: string; description?: string }>;
          multiSelect: boolean;
        }>;
      }) => void,
    ): () => void;
    onDone(cb: (e: { projectId: string; brief: ProjectBrief }) => void): () => void;
    onError(
      cb: (e: {
        projectId: string;
        error: { code: string; message: string; retryable: boolean };
      }) => void,
    ): () => void;
  };
  chat: {
    load(projectId: string): Promise<ChatSnapshot>;
    send(projectId: string, text: string): Promise<{ queueId: string }>;
    cancel(projectId: string): Promise<{ ok: boolean }>;
    retry(projectId: string, queueId: string): Promise<void>;
    removeQueueItem(projectId: string, queueId: string): Promise<void>;
    appendWorkflow(
      projectId: string,
      event: Omit<ChatWorkflowEvent, "id" | "projectId" | "createdAt">,
    ): Promise<void>;
    onEvent(cb: (event: ChatEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    api: BridgeApi;
  }
}

export const api: BridgeApi = window.api;
