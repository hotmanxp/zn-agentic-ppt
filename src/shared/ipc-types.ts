import type {
  Outline,
  OutlineSlide,
  ProjectDetail,
  ProjectMeta,
  Settings,
  StyleSettings,
} from "./types.js";

export interface CollectSaveRequest {
  id: string;
  topic: string;
  source: string;
}

export interface OutlineUpdateRequest {
  id: string;
  slideId: string;
  patch: Partial<Pick<OutlineSlide, "title" | "bullets" | "notes">>;
}

export interface SlideAddResponse {
  slide: OutlineSlide;
}

export interface SlideRegenerateResponse {
  html: string;
  durationMs: number;
}

export interface HtmlGenerateResponse {
  html: string;
  durationMs: number;
}

export interface StyleSaveRequest {
  id: string;
  style: StyleSettings;
}

export interface HtmlSlideUpdatedPayload {
  projectId: string;
  slideId: string;
  html: string;
}

export interface SDKEventPayload {
  runId: string;
  message: unknown; // narrow in renderer
}

export interface GenerationProgressPayload {
  runId: string;
  phase: "connecting" | "streaming" | "writing";
  current: number;
  total?: number;
}

export interface GenerationDonePayload {
  runId: string;
  html: string;
  durationMs: number;
}

export interface GenerationErrorPayload {
  runId: string;
  error: { code: string; message: string; retryable: boolean };
}

export interface StartGenerationRequest {
  id: string;
  opts?: { model?: string };
}

export interface StartGenerationResponse {
  runId: string;
}

export interface CreateProjectRequest {
  topic: string;
}

export interface UpdateProjectRequest {
  id: string;
  patch: Partial<Pick<ProjectMeta, "title" | "topic" | "outline">>;
}

export type { OutlineSlide, Outline, ProjectMeta, ProjectDetail, Settings, StyleSettings };
