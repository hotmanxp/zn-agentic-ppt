import type { OutlineSlide, ProjectBrief, ProjectDetail } from "@shared/types";
import { create } from "zustand";
import { api } from "../lib/api.js";
import { SCENARIOS } from "../workbench/data/scenarios.js";
import { KNOWN_SOURCES } from "../workbench/data/sources.js";
import {
  type Brief,
  DEFAULT_BRIEF,
  DEFAULT_TASK_TEXT,
  type DeckVersion,
  type OutlineItem,
  type Revision,
  type Scenario,
  type ScenarioId,
  type SourceItem,
  type WorkbenchPhase,
} from "../workbench/data/types.js";
import { useChatStore } from "./chat.js";
import { useIntentGenerationStore } from "./intentGeneration.js";
import { useOutlineStore } from "./outline.js";
import { usePptGenerationStore } from "./pptGeneration.js";
import { useProjectDetailStore } from "./projectDetail.js";
import { useProjectStore } from "./project.js";
import { useStageStreamStore } from "./stageStream.js";

export type ArtifactTab = "deck" | "sources" | "task";

interface WorkbenchState {
  phase: WorkbenchPhase;
  activeProjectId: string | null;

  scenario: Scenario;
  brief: Brief;
  taskText: string;
  prompt: string;

  clarificationNotes: string[];
  sourceRequirements: string[];

  selectedSources: string[];
  uploadedSources: SourceItem[];
  outlineDraft: OutlineItem[];
  revisions: Revision[];
  deckVersions: DeckVersion[];
  pendingRevisionId: string | null;

  searchProgress: number;

  sidebarCollapsed: boolean;
  artifactOpen: boolean;
  artifactTab: ArtifactTab;
  deckPreviewOpen: boolean;
  deckPreviewRatio: number; // reserved for future drag-resize handle
  selectedSlide: number;
  activeSourceId: string | null;
  sourceMenuOpen: boolean;
  toast: string | null;

  // Actions
  setPhase: (p: WorkbenchPhase) => void;
  openProject: (id: string) => Promise<void>;
  reset: () => void;

  beginClarification: (next?: Scenario) => Promise<string | null>;
  confirmBrief: (id: string) => Promise<void>;

  approveSources: (id: string) => Promise<void>;
  approveOutline: (id: string) => Promise<void>;
  startRevision: (id: string, text: string) => Promise<void>;

  toggleSource: (id: string) => void;
  uploadMaterials: (files: FileList | null) => void;
  setSourceMenuOpen: (v: boolean) => void;

  updateBriefField: (key: keyof Brief, value: string) => void;
  useExampleBrief: () => void;

  updateOutlineItem: (idx: number, key: "title" | "note" | "source", value: string) => void;
  addOutlineItem: () => void;
  removeOutlineItem: (idx: number) => void;
  moveOutlineItem: (idx: number, dir: -1 | 1) => void;

  setPrompt: (v: string) => void;
  submitPrompt: (text: string) => Promise<void>;
  /** Internal: route a user message into the chat queue so the LLM sees
   * every input (even when phases are busy and the legacy dispatch is a
   * no-op). Returns the queueId on success, null on failure. */
  sendChatMessage: (text: string) => Promise<string | null>;

  setActiveSource: (id: string | null) => void;
  setSelectedSlide: (idx: number) => void;
  setArtifactTab: (t: ArtifactTab) => void;
  setArtifactOpen: (v: boolean) => void;
  toggleArtifact: () => void;
  toggleSidebar: () => void;
  openDeckPreview: () => void;
  closeDeckPreview: () => void;
  setDeckPreviewRatio: (r: number) => void;

  setSearchProgress: (n: number) => void;
  setToast: (msg: string | null) => void;
}

function normalizeOutline(slides: OutlineSlide[]): OutlineItem[] {
  return slides.map((s, i) => ({
    id: s.id,
    page: i + 1,
    title: s.title,
    note: s.bullets.join(" · "),
    source: "",
  }));
}

function buildTaskSummary(scenario: Scenario, brief: Brief, extraContext: string): string {
  const extra = extraContext ? ` 补充背景：${extraContext}。` : "";
  if (scenario.id === "internal") {
    return `${scenario.name}：围绕${brief.client}，面向${brief.audience}，生成一份${brief.duration}、${brief.pages}的年度汇报材料，目标是${brief.goal}。${extra}`;
  }
  if (scenario.id === "launch") {
    return `${scenario.name}：围绕${brief.client}，面向${brief.audience}，生成一份${brief.duration}、${brief.pages}的新品发布演讲材料，目标是${brief.goal}。${extra}`;
  }
  return `${scenario.name}：面向${brief.client}的${brief.audience}，生成一份${brief.duration}、${brief.pages}的演示材料，目标是${brief.goal}。${extra}`;
}

function derivePhaseFromDetail(detail: ProjectDetail | null): WorkbenchPhase {
  if (!detail) return "idle";
  if (detail.slides && detail.slides.length > 0) return "complete";
  if (detail.structuredOutline && detail.structuredOutline.slides.length > 0) return "outline";
  if (detail.brief || detail.source) return "sources";
  if (detail.topic) return "clarify";
  return "idle";
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  phase: "idle",
  activeProjectId: null,

  scenario: SCENARIOS[0],
  brief: { ...DEFAULT_BRIEF },
  taskText: DEFAULT_TASK_TEXT,
  prompt: "",

  clarificationNotes: [],
  sourceRequirements: [],

  selectedSources: KNOWN_SOURCES.map((s) => s.id),
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

  setPhase: (p) => set({ phase: p }),

  openProject: async (id: string) => {
    const detail = await useProjectDetailStore.getState().load(id);
    if (!detail) {
      set({ toast: "项目不存在" });
      return;
    }
    void useChatStore.getState().load(id);
    const phase = derivePhaseFromDetail(detail);
    const outlineDraft = detail.structuredOutline
      ? normalizeOutline(detail.structuredOutline.slides)
      : [];
    set({
      activeProjectId: id,
      phase,
      artifactTab:
        phase === "complete" || phase === "generating" || phase === "outline" ? "deck" : "task",
      outlineDraft,
      deckPreviewOpen: false,
      activeSourceId: null,
      selectedSlide: 0,
      revisions: [],
      pendingRevisionId: null,
      sourceMenuOpen: false,
      toast: null,
    });
  },

  reset: () => {
    useOutlineStore.getState().setOutline([], 0);
    usePptGenerationStore.getState().reset();
    useStageStreamStore.getState().reset();
    useChatStore.getState().reset();
    set({
      phase: "idle",
      activeProjectId: null,
      scenario: SCENARIOS[0],
      brief: { ...DEFAULT_BRIEF },
      taskText: DEFAULT_TASK_TEXT,
      prompt: "",
      clarificationNotes: [],
      sourceRequirements: [],
      outlineDraft: [],
      revisions: [],
      deckVersions: [],
      pendingRevisionId: null,
      searchProgress: 0,
      selectedSources: KNOWN_SOURCES.map((s) => s.id),
      uploadedSources: [],
      deckPreviewOpen: false,
      activeSourceId: null,
      selectedSlide: 0,
      sourceMenuOpen: false,
      toast: null,
    });
  },

  beginClarification: async (next) => {
    const scenario = next ?? SCENARIOS[0];
    set({
      scenario,
      brief: {
        client: "",
        audience: "",
        goal: "",
        duration: "",
        pages: "",
        template: DEFAULT_BRIEF.template,
      },
      taskText: `我想生成一份${scenario.name}`,
      prompt: "",
      phase: "clarify",
      artifactTab: "task",
      outlineDraft: [],
      revisions: [],
      deckVersions: [],
      pendingRevisionId: null,
      deckPreviewOpen: false,
      activeSourceId: null,
      clarificationNotes: [],
      sourceRequirements: [],
      sourceMenuOpen: false,
      toast: null,
    });
    return null;
  },

  confirmBrief: async (id) => {
    const { scenario, brief, clarificationNotes, selectedSources, sourceRequirements } = get();
    const summary = buildTaskSummary(scenario, brief, clarificationNotes.join("；"));
    const payload = JSON.stringify({
      brief,
      scenario: scenario.id,
      selectedSources,
      clarificationNotes,
      sourceRequirements,
    });
    const briefPayload: ProjectBrief = { markdown: payload };
    await api.stage.collectSave(id, summary, JSON.stringify(selectedSources), briefPayload);
    await useChatStore
      .getState()
      .appendWorkflow({ type: "brief-confirmed", payload: { summary } });
    set({
      taskText: summary,
      artifactTab: "sources",
      sourceMenuOpen: false,
      phase: "searching",
    });
  },

  approveSources: async (id) => {
    const { selectedSources, sourceRequirements } = get();
    set({ phase: "buildingOutline" });
    // We do NOT pre-call stageStream.reset() here — the events for this
    // IPC call are already in flight (the IPC fires STAGE_OUTLINE_STREAM
    // with phase=streaming while the LLM is generating). If we reset the
    // store first, applyEvent's `s.kind !== e.kind` filter rejects
    // every event (kind is null after reset) and the user sees a
    // stuck 0% progress bar for the full ~30s LLM call. Instead, we
    // start a fresh stage session which sets kind="outline" +
    // projectId, accepting the in-flight events.
    useStageStreamStore.getState().prepare("outline", id);
    const r = await api.stage.outlineGenerate(id);
    const slides = r.phase === "done" ? r.slides : [];
    await useChatStore.getState().appendWorkflow({
      type: "sources-confirmed",
      payload: { sourceIds: selectedSources, requirements: sourceRequirements },
    });
    set({
      outlineDraft: normalizeOutline(slides),
      artifactTab: "deck",
      phase: slides.length > 0 ? "outline" : "buildingOutline",
    });
    void useOutlineStore.getState().setOutline(slides, Date.now());
    if (slides.length > 0) {
      await useChatStore
        .getState()
        .appendWorkflow({ type: "outline-ready", payload: { slideCount: slides.length } });
    }
  },

  approveOutline: async (id) => {
    const outlineCount = get().outlineDraft.length;
    usePptGenerationStore.getState().reset();
    // Seed total/slide skeleton BEFORE start() so GenerationCard has a
    // non-zero denominator from the first frame. Without this the user
    // stares at "0%" for the full generation (no slide events are
    // dispatched until the orchestrator finishes its first slide).
    const seedSlides = get().outlineDraft.map((s) => ({ id: s.id, title: s.title }));
    usePptGenerationStore.getState().initialize(id, seedSlides);
    set({
      phase: "generating",
      pendingRevisionId: null,
      artifactTab: "deck",
    });
    await useChatStore.getState().appendWorkflow({
      type: "outline-confirmed",
      payload: { slideCount: outlineCount },
    });
    await useChatStore
      .getState()
      .appendWorkflow({ type: "generation-started", payload: { source: "approve-outline" } });
    // Phase transition to 'complete' / 'outline' (cancelled) / etc.
    // is driven by the Workbench watcher once pptGen reports its phase.
    void (async () => {
      useIntentGenerationStore.getState().reset();
      try {
        await useIntentGenerationStore.getState().run(id);
        await useStageStreamStore.getState().start("outline", id);
        await usePptGenerationStore.getState().start(id);
      } catch {
        // intent store already set phase=error; GenerationProgressPanel will surface
      }
    })();
  },

  startRevision: async (id, text) => {
    const revisionId = `revision-${Date.now()}`;
    // Re-seed in case the outline was edited since the last run.
    const seedSlides = get().outlineDraft.map((s) => ({ id: s.id, title: s.title }));
    usePptGenerationStore.getState().initialize(id, seedSlides);
    set((s) => ({
      revisions: [...s.revisions, { id: revisionId, text }],
      prompt: "",
      pendingRevisionId: revisionId,
      phase: "generating",
      artifactTab: "deck",
      toast: "已按修改建议重新生成 PPT",
    }));
    await useChatStore
      .getState()
      .appendWorkflow({ type: "revision-requested", payload: { revisionId, text } });
    await useChatStore
      .getState()
      .appendWorkflow({ type: "generation-started", payload: { source: "revision" } });
    await usePptGenerationStore.getState().start(id);
  },

  toggleSource: (id) => {
    set((s) => ({
      selectedSources: s.selectedSources.includes(id)
        ? s.selectedSources.filter((x) => x !== id)
        : [...s.selectedSources, id],
    }));
  },

  uploadMaterials: (files) => {
    const items = Array.from(files ?? []);
    if (items.length === 0) return;
    const now = Date.now();
    const additions: SourceItem[] = items.map((file, idx) => {
      const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";
      const type = ext === "PPT" ? "PPTX" : ext === "DOC" ? "DOCX" : ext;
      return {
        id: `upload-${now}-${idx}`,
        type: type as SourceItem["type"],
        title: file.name,
        library: "本次临时材料",
        updated: "刚刚",
        status: "解析完成",
        used: "待 Agent 分配",
      };
    });
    set((s) => ({
      uploadedSources: [...s.uploadedSources, ...additions],
      selectedSources: [...s.selectedSources, ...additions.map((a) => a.id)],
      toast: `已上传并解析 ${additions.length} 份材料，仅用于本次任务`,
    }));
  },

  setSourceMenuOpen: (v) => set({ sourceMenuOpen: v }),

  updateBriefField: (key, value) => set((s) => ({ brief: { ...s.brief, [key]: value } })),

  useExampleBrief: () => {
    const { scenario } = get();
    const def = SCENARIOS[0];
    set({
      brief: {
        client:
          scenario.id === "internal"
            ? "2026 年度培训工作汇报"
            : scenario.id === "launch"
              ? "知鸟 AI 陪练新品发布"
              : def.audience
                ? "某大型股份制银行"
                : "某大型股份制银行",
        audience: scenario.audience || DEFAULT_BRIEF.audience,
        goal: scenario.goal || DEFAULT_BRIEF.goal,
        duration: scenario.duration || DEFAULT_BRIEF.duration,
        pages: scenario.pages || DEFAULT_BRIEF.pages,
        template: DEFAULT_BRIEF.template,
      },
    });
  },

  updateOutlineItem: (idx, key, value) => {
    set((s) => ({
      outlineDraft: s.outlineDraft.map((it, i) => (i === idx ? { ...it, [key]: value } : it)),
    }));
  },

  addOutlineItem: async () => {
    const id = get().activeProjectId;
    if (!id) return;
    const next = await useOutlineStore.getState().addSlide(id);
    set({
      outlineDraft: normalizeOutline(next.slides),
    });
  },

  removeOutlineItem: async (idx) => {
    const id = get().activeProjectId;
    if (!id) return;
    const item = get().outlineDraft[idx];
    if (!item) return;
    if (get().outlineDraft.length <= 1) return;
    const next = await useOutlineStore.getState().deleteSlide(id, item.id);
    set({
      outlineDraft: normalizeOutline(next.slides),
    });
  },

  moveOutlineItem: (idx, dir) => {
    set((s) => {
      const next = idx + dir;
      if (next < 0 || next >= s.outlineDraft.length) return {};
      const arr = [...s.outlineDraft];
      const [item] = arr.splice(idx, 1);
      arr.splice(next, 0, item);
      return { outlineDraft: arr.map((it, i) => ({ ...it, page: i + 1 })) };
    });
  },

  setPrompt: (v) => set({ prompt: v }),

  submitPrompt: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { phase, activeProjectId } = get();

    if (phase === "idle") {
      const scenario: Scenario = {
        ...SCENARIOS[0],
        id: "custom" as ScenarioId,
        name: "自定义演示",
      };
      await get().beginClarification(scenario);
      const project = await api.project.create(trimmed);
      await useProjectStore.getState().load();
      await get().openProject(project.id);
      await useChatStore
        .getState()
        .appendWorkflow({ type: "project-created", payload: { topic: trimmed } });
      const queueId = await get().sendChatMessage(trimmed);
      if (queueId) set({ prompt: "" });
      return;
    }

    if (!activeProjectId) return;

    if (phase === "searching" || phase === "buildingOutline" || phase === "generating") {
      // Busy: the business generator is already running. Don't enqueue a
      // duplicate chat message — the composer UI is already replaced by
      // the busy/cancel card.
      return;
    }

    if (phase === "clarify") {
      const { scenario } = get();
      const patch: Partial<Brief> = {};
      const isInternal = scenario.id === "internal";
      const isLaunch = scenario.id === "launch";
      const clientMatch = isInternal
        ? trimmed.match(/(?:主题|汇报主题|事项|汇报事项)(?:是|为|：|:)\s*([^，,。；;]+)/) ||
          trimmed.match(
            /([^，,。；;]{2,30}(?:年度|季度|月度|工作汇报|经营复盘|项目复盘|阶段总结)[^，,。；;]*)/,
          )
        : isLaunch
          ? trimmed.match(/(?:发布主题|主题|发布|新品)(?:是|为|：|:)?\s*([^，,。；;]+)/) ||
            trimmed.match(
              /([^，,。；;]{2,30}(?:AI陪练|AI 陪练|AI知识库|AI 知识库|AI培训专家|AI 培训专家|新品发布|产品发布)[^，,。；;]*)/,
            )
          : trimmed.match(/客户(?:是|为|：|:)\s*([^，,。；;]+)/) ||
            trimmed.match(/([^，,。；;]{2,24}(?:银行|公司|集团|事业部))/);
      const audienceMatch = isInternal
        ? trimmed.match(/(?:汇报对象|对象|面向)(?:是|为|：|:)?\s*([^，,。；;]+)/)
        : trimmed.match(/(?:听众|面向)(?:是|为|：|:)?\s*([^，,。；;]+)/);
      const goalMatch = trimmed.match(/目标(?:是|为|：|:)\s*([^。；;]+)/);
      const durationMatch = trimmed.match(/(\d+)\s*分钟/);
      const pagesMatch = trimmed.match(/(\d+)\s*页/);
      if (clientMatch) patch.client = clientMatch[1].trim();
      if (audienceMatch) patch.audience = audienceMatch[1].trim();
      if (goalMatch) patch.goal = goalMatch[1].trim();
      if (durationMatch) patch.duration = `${durationMatch[1]} 分钟`;
      if (pagesMatch) patch.pages = `${pagesMatch[1]} 页`;
      const recognizedCount = Object.keys(patch).length;
      const queueId = await get().sendChatMessage(trimmed);
      if (!queueId) return;
      set((s) => ({
        brief: { ...s.brief, ...patch },
        clarificationNotes: [...s.clarificationNotes, trimmed],
        prompt: "",
        toast: recognizedCount
          ? `已识别并回填 ${recognizedCount} 项任务信息`
          : "补充背景已加入任务上下文",
      }));
      return;
    }

    if (phase === "sources") {
      const queueId = await get().sendChatMessage(trimmed);
      if (!queueId) return;
      set((s) => ({
        sourceRequirements: [...s.sourceRequirements, trimmed],
        prompt: "",
        toast: "资料要求已记录，将用于生成大纲",
      }));
      return;
    }

    if (phase === "outline") {
      const queueId = await get().sendChatMessage(trimmed);
      if (!queueId) return;
      set((s) => ({
        revisions: [...s.revisions, { id: `note-${Date.now()}`, text: trimmed }],
        prompt: "",
        toast: "修改要求已记录，待确认后重新生成",
      }));
      return;
    }

    if (phase === "complete") {
      // Send the free-form message to chat (so the agent can react even
      // outside of formal revisions), then explicitly record the user's
      // revision intent as a workflow event. We do NOT auto-start a
      // generation run — the user must click "按修改要求重新生成" to
      // commit the change through `startRevision`.
      const queueId = await get().sendChatMessage(trimmed);
      if (!queueId) return;
      const revisionId = `revision-${Date.now()}`;
      await useChatStore.getState().appendWorkflow({
        type: "revision-requested",
        payload: { revisionId, text: trimmed },
      });
      set((s) => ({
        revisions: [...s.revisions, { id: revisionId, text: trimmed }],
        prompt: "",
        toast: "修改要求已发送给 Agent，可在大纲确认后重生成",
      }));
      return;
    }
  },

  sendChatMessage: async (text) => {
    const projectId = get().activeProjectId;
    if (!projectId) return null;
    try {
      const r = await api.chat.send(projectId, text);
      return r.queueId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ toast: msg });
      return null;
    }
  },

  setActiveSource: (id) => set({ activeSourceId: id, deckPreviewOpen: false }),
  setSelectedSlide: (idx) => set({ selectedSlide: Math.max(0, idx) }),
  setArtifactTab: (t) => set({ artifactTab: t }),
  setArtifactOpen: (v) => set({ artifactOpen: v }),
  toggleArtifact: () => set((s) => ({ artifactOpen: !s.artifactOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openDeckPreview: () => set({ deckPreviewOpen: true, deckPreviewRatio: 60, selectedSlide: 0 }),
  closeDeckPreview: () => set({ deckPreviewOpen: false }),
  setDeckPreviewRatio: (r) => set({ deckPreviewRatio: Math.max(40, Math.min(60, r)) }),

  setSearchProgress: (n) => set({ searchProgress: n }),

  setToast: (msg) => set({ toast: msg }),
}));
