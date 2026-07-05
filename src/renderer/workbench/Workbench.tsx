import { CheckCircle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AskUserQuestionModal } from "../components/AskUserQuestionModal.js";
import { useHtmlGenerationSubscription } from "../hooks/useHtmlGenerationSubscription.js";
import { useStageStreamSubscription } from "../hooks/useStageStreamSubscription.js";
import { useWorkbenchSubscriptions } from "../hooks/useWorkbenchSubscriptions.js";
import { api } from "../lib/api.js";
import { useBriefOptimizeStore } from "../stores/briefOptimize.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useProjectStore } from "../stores/project.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { ArtifactPanel } from "./ArtifactPanel.js";
import { ClarificationComposer } from "./ClarificationComposer.js";
import { ClarificationFlow } from "./ClarificationFlow.js";
import { Composer } from "./Composer.js";
import { Conversation } from "./Conversation.js";
import { DeckPreviewDrawer } from "./DeckPreviewDrawer.js";
import { Header } from "./Header.js";
import { SettingsModal } from "./SettingsModal.js";
import { Sidebar } from "./Sidebar.js";
import { SourceDetailDrawer } from "./SourceDetailDrawer.js";
import { WelcomeStage } from "./WelcomeStage.js";
import { SCENARIOS } from "./data/scenarios.js";
import type { Scenario } from "./data/types.js";

export function Workbench() {
  useStageStreamSubscription();
  useHtmlGenerationSubscription();
  useWorkbenchSubscriptions();

  const phase = useWorkbenchStore((s) => s.phase);
  const setPhase = useWorkbenchStore((s) => s.setPhase);
  const scenario = useWorkbenchStore((s) => s.scenario);
  const clarificationNotes = useWorkbenchStore((s) => s.clarificationNotes);
  const artifactOpen = useWorkbenchStore((s) => s.artifactOpen);
  const deckPreviewOpen = useWorkbenchStore((s) => s.deckPreviewOpen);
  const deckPreviewRatio = useWorkbenchStore((s) => s.deckPreviewRatio);
  const toast = useWorkbenchStore((s) => s.toast);
  const setToast = useWorkbenchStore((s) => s.setToast);
  const reset = useWorkbenchStore((s) => s.reset);
  const openProject = useWorkbenchStore((s) => s.openProject);
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId);

  const stageStream = useStageStreamStore((s) => s.phase);
  const pptGen = usePptGenerationStore((s) => s.phase);
  const pptGenTotal = usePptGenerationStore((s) => s.total);
  const pptGenCompleted = usePptGenerationStore((s) => s.completed);
  const loadProjects = useProjectStore((s) => s.load);

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Drive the mock "searching" tick via the workbench store so the
  // conversation card can read the same progress value.
  const setSearchProgress = useWorkbenchStore((s) => s.setSearchProgress);
  useEffect(() => {
    if (phase !== "searching") {
      setSearchProgress(0);
      return;
    }
    setSearchProgress(0);
    const t1 = setTimeout(() => setSearchProgress(25), 650);
    const t2 = setTimeout(() => setSearchProgress(50), 1300);
    const t3 = setTimeout(() => setSearchProgress(75), 1950);
    const t4 = setTimeout(() => setSearchProgress(100), 2600);
    const t5 = setTimeout(() => setPhase("sources"), 3050);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [phase, setPhase, setSearchProgress]);

  // Coordinator: when brief.optimize finishes, parse the JSON markdown
  // back into brief fields and persist via collectSave.
  const briefPhase = useBriefOptimizeStore((s) => s.phase);
  const lastBrief = useBriefOptimizeStore((s) => s.lastBrief);
  useEffect(() => {
    if (briefPhase !== "done" || !lastBrief) return;
    const id = activeProjectId;
    if (!id) {
      useBriefOptimizeStore.getState().reset();
      return;
    }
    try {
      const parsed = JSON.parse(lastBrief.markdown);
      if (parsed && typeof parsed === "object") {
        const b = parsed.brief ?? parsed;
        if (b.client || b.audience || b.goal || b.duration || b.pages) {
          const patch: Record<string, string> = {};
          for (const k of [
            "client",
            "audience",
            "goal",
            "duration",
            "pages",
            "template",
          ] as const) {
            if (typeof b[k] === "string") patch[k] = b[k];
          }
          useWorkbenchStore.setState((s) => ({ brief: { ...s.brief, ...patch } }));
        }
      }
      const newBrief = useWorkbenchStore.getState().brief;
      const scenario = useWorkbenchStore.getState().scenario;
      const summary = `${scenario.name}：面向${newBrief.client}的${newBrief.audience}，生成一份${newBrief.duration}、${newBrief.pages}的演示材料。`;
      void api.stage.collectSave(id, summary, "", { markdown: lastBrief.markdown });
      setToast("项目信息已自动填充");
    } catch (e) {
      setToast(`解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    useBriefOptimizeStore.getState().reset();
  }, [briefPhase, lastBrief, activeProjectId, setToast]);

  // Derive phase from source-of-truth stores.
  useEffect(() => {
    if (phase === "buildingOutline" && stageStream === "done") {
      setPhase("outline");
    }
    if (phase === "generating" && pptGen === "done") {
      // Record completion card (one entry per run).
      useWorkbenchStore.setState((s) => {
        const lastRevision = s.revisions[s.revisions.length - 1];
        const isThisRevision = s.pendingRevisionId && lastRevision?.id === s.pendingRevisionId;
        return {
          deckVersions: [
            ...s.deckVersions,
            {
              id: `run-${Date.now()}`,
              revision: isThisRevision ? lastRevision?.text : undefined,
              revisionId: isThisRevision ? lastRevision?.id : undefined,
              pageCount: pptGenTotal || 1,
              sourceCount: s.selectedSources.length,
              createdAt: Date.now(),
            },
          ],
          pendingRevisionId: isThisRevision ? null : s.pendingRevisionId,
        };
      });
      setPhase("complete");
    }
    if (phase === "generating" && pptGen === "cancelled") setPhase("outline");
    if (phase === "generating" && pptGen === "error") setPhase("complete");
  }, [phase, stageStream, pptGen, pptGenTotal, pptGenCompleted, setPhase]);

  const handleQuickStart = async (scenarioIdx: number) => {
    const sc: Scenario = SCENARIOS[scenarioIdx];
    const topic = sc.name;
    const project = await api.project.create(topic);
    await loadProjects();
    await openProject(project.id);
    useWorkbenchStore.setState({ phase: "clarify", scenario: sc });
  };

  const handleNewTask = () => {
    reset();
  };

  const layoutClass = [
    deckPreviewOpen ? "deck-preview-open" : "",
    artifactOpen ? "" : "artifact-closed",
  ]
    .filter(Boolean)
    .join(" ");

  const sidebarWidth = useWorkbenchStore((s) => s.sidebarCollapsed) ? 72 : 238;

  const layoutStyle = deckPreviewOpen
    ? ({
        "--left-width": "40vw",
        "--preview-width": "60vw",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={`agent-app ${layoutClass}`} style={layoutStyle}>
      <Sidebar onSettings={() => setSettingsOpen(true)} onNotify={setToast} />
      <main className="agent-workspace">
        <Header />
        <div className="workspace-body">
          {phase === "idle" && <WelcomeStage onQuickStart={handleQuickStart} />}
          {phase === "clarify" && (
            <ClarificationFlow scenario={scenario} notes={clarificationNotes} />
          )}
          {phase !== "idle" && phase !== "clarify" && <Conversation />}
        </div>
        {phase === "idle" ? (
          <div className="composer-wrap">
            <div className="composer">
              <div style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 13 }}>
                选择上方类型或快捷任务卡开始。
              </div>
            </div>
          </div>
        ) : phase === "clarify" ? (
          <ClarificationComposer scenario={scenario} />
        ) : phase === "searching" ? (
          <div className="composer-wrap composer-wrap-busy">
            <div className="composer-busy-state">
              <span>正在查找资料，完成后会请你确认引用资料</span>
            </div>
          </div>
        ) : (
          <Composer
            onApproveSources={() => {
              const id = useWorkbenchStore.getState().activeProjectId;
              if (id) void useWorkbenchStore.getState().approveSources(id);
            }}
            onApproveOutline={() => {
              const id = useWorkbenchStore.getState().activeProjectId;
              if (id) void useWorkbenchStore.getState().approveOutline(id);
            }}
            onRegenerateOutline={() => {
              // The "重新生成大纲" button was previously a no-op toast.
              // Re-run the same outline generation flow as approveSources.
              const id = useWorkbenchStore.getState().activeProjectId;
              if (id) void useWorkbenchStore.getState().approveSources(id);
            }}
          />
        )}
      </main>
      {artifactOpen && <ArtifactPanel />}
      <SourceDetailDrawer />
      <DeckPreviewDrawer />
      {deckPreviewOpen && <div style={{ width: 8, background: "#e8e7e2" }} aria-hidden="true" />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {briefPhase === "asking" && <AskUserQuestionModal />}
      {toast && (
        <div className="agent-toast" role="status">
          <CheckCircle size={18} weight="fill" />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {/* hidden helper to expose activeProjectId in devtools */}
      {activeProjectId === null && null}
    </div>
  );
}
