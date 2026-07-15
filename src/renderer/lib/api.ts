import type {
  OutlineSlide,
  ProjectBrief,
  ProjectDetail,
  ProjectMeta,
  Settings,
  StyleSettings,
} from "@shared/types";

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
  brief: never;
}

declare global {
  interface Window {
    api: BridgeApi;
  }
}

export const api: BridgeApi = window.api;
