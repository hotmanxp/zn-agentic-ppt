// Domain types for the Codex workbench — extracted from the prototype's implicit shapes.

export type SourceType = "PDF" | "PPTX" | "DOCX" | "FILE";

export interface SourceItem {
  id: string;
  type: SourceType;
  title: string;
  library: string;
  updated: string;
  status: string;
  used: string;
}

export interface SourcePreview {
  creator: string;
  createdAt: string;
  directory: string[];
  content: string[];
}

export type ScenarioId = "sales" | "launch" | "internal" | "custom";

export interface Scenario {
  id: ScenarioId;
  name: string;
  body: string;
  audience: string;
  goal: string;
  duration: string;
  pages: string;
}

export interface Brief {
  client: string;
  audience: string;
  goal: string;
  duration: string;
  pages: string;
  template: string;
}

export interface OutlineItem {
  /** Stable id from Outline.slides[].id */
  id: string;
  /** 1-indexed display page number */
  page: number;
  title: string;
  note: string;
  source: string;
}

export interface DeckVersion {
  id: string;
  revision?: string;
  revisionId?: string;
  pageCount: number;
  sourceCount: number;
  createdAt: number;
}

export interface Revision {
  id: string;
  text: string;
}

export type WorkbenchPhase =
  | "idle"
  | "clarify"
  | "searching"
  | "sources"
  | "buildingOutline"
  | "outline"
  | "generating"
  | "complete";

export const PHASE_ORDER: WorkbenchPhase[] = [
  "idle",
  "clarify",
  "searching",
  "sources",
  "buildingOutline",
  "outline",
  "generating",
  "complete",
];

export const DEFAULT_BRIEF: Brief = {
  client: "某大型股份制银行",
  audience: "培训负责人、数字化学习平台主管",
  goal: "获得后续方案演示机会",
  duration: "15 分钟",
  pages: "8 页",
  template: "知鸟商务简约模板",
};

export const DEFAULT_TASK_TEXT =
  "首次拜访某大型银行，面向培训与数字化学习负责人，生成一份 15 分钟、8 页的产品介绍，目标是获得后续方案演示机会。";
