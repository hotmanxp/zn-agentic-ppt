import { CheckCircle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useHtmlGenerationSubscription } from "../hooks/useHtmlGenerationSubscription.js";
import { useStageStreamSubscription } from "../hooks/useStageStreamSubscription.js";
import { useWorkbenchSubscriptions } from "../hooks/useWorkbenchSubscriptions.js";
import { api } from "../lib/api.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useProjectDetailStore } from "../stores/projectDetail.js";
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
import { SettingsView } from "./SettingsView.js";
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

  const [settingsView, setSettingsView] = useState(false);
  const openSettings = () => setSettingsView(true);
  const toggleSettings = () => setSettingsView((v) => !v);
  const closeSettings = () => setSettingsView(false);

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

  // Coordinator: brief fields are now filled directly by ClarificationComposer
  // (no LLM optimize step). No coordinator logic required here.

  // Derive phase from source-of-truth stores.
  useEffect(() => {
    if (phase === "buildingOutline" && stageStream === "done") {
      setPhase("outline");
    }
    if (phase === "generating" && pptGen === "done") {
      // Reload project detail so the deck preview / artifact panel see
      // the actual HTML files that sub-agents just wrote to disk.
      // The pptGeneration store gets STAGE_HTML_SLIDE_READY broadcasts
      // as the orchestrator runs, but if any were dropped (or the user
      // navigated away), this guarantees the preview matches disk.
      const detailProjectId = useWorkbenchStore.getState().activeProjectId;
      if (detailProjectId) {
        void useProjectDetailStore.getState().load(detailProjectId);
      }
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
    <div className={`agent-app ${layoutClass} ${settingsView ? "settings-view-open" : ""}`} style={layoutStyle}>
      <Sidebar
        onSettings={openSettings}
        onNotify={setToast}
        onNewTask={() => {
          if (settingsView) closeSettings();
          handleNewTask();
        }}
        settingsActive={settingsView}
      />
      <main className="agent-workspace">
        <Header overrideTitle={settingsView ? "模型与提示词设置" : undefined} />
        <div className="workspace-body">
          {settingsView ? (
            <SettingsView />
          ) : (
            <>
              {phase === "idle" && <WelcomeStage onQuickStart={handleQuickStart} />}
              {phase === "clarify" && <ClarificationFlow scenario={scenario} />}
              {phase !== "idle" && phase !== "clarify" && <Conversation />}
            </>
          )}
        </div>
        {settingsView ? null : phase === "idle" ? (
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
              const id = useWorkbenchStore.getState().activeProjectId;
              if (id) void useWorkbenchStore.getState().approveSources(id);
            }}
          />
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
