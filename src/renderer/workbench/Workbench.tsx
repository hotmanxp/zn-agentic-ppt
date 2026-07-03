import { useEffect, useState } from 'react'
import { CheckCircle, X } from '@phosphor-icons/react'
import { useStageStreamSubscription } from '../hooks/useStageStreamSubscription.js'
import { useHtmlGenerationSubscription } from '../hooks/useHtmlGenerationSubscription.js'
import { useWorkbenchSubscriptions } from '../hooks/useWorkbenchSubscriptions.js'
import { useWorkbenchStore } from '../stores/workbench.js'
import { useStageStreamStore } from '../stores/stageStream.js'
import { usePptGenerationStore } from '../stores/pptGeneration.js'
import { useBriefOptimizeStore } from '../stores/briefOptimize.js'
import { useProjectStore } from '../stores/project.js'
import { api } from '../lib/api.js'
import { SCENARIOS } from './data/scenarios.js'
import { Header } from './Header.js'
import { Sidebar } from './Sidebar.js'
import { Conversation } from './Conversation.js'
import { ClarificationFlow } from './ClarificationFlow.js'
import { ClarificationComposer } from './ClarificationComposer.js'
import { Composer } from './Composer.js'
import { ArtifactPanel } from './ArtifactPanel.js'
import { DeckPreviewDrawer } from './DeckPreviewDrawer.js'
import { SourceDetailDrawer } from './SourceDetailDrawer.js'
import { WelcomeStage } from './WelcomeStage.js'
import { SettingsModal } from './SettingsModal.js'
import { AskUserQuestionModal } from '../components/AskUserQuestionModal.js'
import type { Scenario } from './data/types.js'

export function Workbench() {
  useStageStreamSubscription()
  useHtmlGenerationSubscription()
  useWorkbenchSubscriptions()

  const phase = useWorkbenchStore((s) => s.phase)
  const setPhase = useWorkbenchStore((s) => s.setPhase)
  const scenario = useWorkbenchStore((s) => s.scenario)
  const clarificationNotes = useWorkbenchStore((s) => s.clarificationNotes)
  const artifactOpen = useWorkbenchStore((s) => s.artifactOpen)
  const deckPreviewOpen = useWorkbenchStore((s) => s.deckPreviewOpen)
  const deckPreviewRatio = useWorkbenchStore((s) => s.deckPreviewRatio)
  const toast = useWorkbenchStore((s) => s.toast)
  const setToast = useWorkbenchStore((s) => s.setToast)
  const reset = useWorkbenchStore((s) => s.reset)
  const openProject = useWorkbenchStore((s) => s.openProject)
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId)

  const stageStream = useStageStreamStore((s) => s.phase)
  const pptGen = usePptGenerationStore((s) => s.phase)
  const pptGenTotal = usePptGenerationStore((s) => s.total)
  const pptGenCompleted = usePptGenerationStore((s) => s.completed)
  const briefPhase = useBriefOptimizeStore((s) => s.phase)
  const loadProjects = useProjectStore((s) => s.load)

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { loadProjects() }, [loadProjects])

  // Drive the mock "searching" tick locally.
  const [searchProgress, setSearchProgress] = useState(0)
  useEffect(() => {
    if (phase !== 'searching') {
      setSearchProgress(0)
      return
    }
    setSearchProgress(0)
    const t1 = setTimeout(() => setSearchProgress(25), 650)
    const t2 = setTimeout(() => setSearchProgress(50), 1300)
    const t3 = setTimeout(() => setSearchProgress(75), 1950)
    const t4 = setTimeout(() => setSearchProgress(100), 2600)
    const t5 = setTimeout(() => setPhase('sources'), 3050)
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout)
  }, [phase, setPhase])

  // Derive phase from source-of-truth stores.
  useEffect(() => {
    if (phase === 'buildingOutline' && stageStream === 'done') {
      setPhase('outline')
    }
    if (phase === 'generating' && pptGen === 'done') {
      // Record completion card (one entry per run).
      useWorkbenchStore.setState((s) => ({
        deckVersions: [
          ...s.deckVersions,
          {
            id: `run-${Date.now()}`,
            revision: s.revisions[s.revisions.length - 1]?.text,
            revisionId: s.revisions[s.revisions.length - 1]?.id,
            pageCount: pptGenTotal || 1,
            sourceCount: s.selectedSources.length,
            createdAt: Date.now(),
          },
        ],
      }))
      setPhase('complete')
    }
    if (phase === 'generating' && pptGen === 'cancelled') setPhase('outline')
    if (phase === 'generating' && pptGen === 'error') setPhase('complete')
  }, [phase, stageStream, pptGen, pptGenTotal, pptGenCompleted, setPhase])

  const handleQuickStart = async (scenarioIdx: number) => {
    const sc: Scenario = SCENARIOS[scenarioIdx]
    const topic = sc.name
    const project = await api.project.create(topic)
    await loadProjects()
    openProject(project.id, null)
    useWorkbenchStore.setState({ phase: 'clarify', scenario: sc })
  }

  const handleNewTask = () => {
    reset()
  }

  const layoutClass = [
    deckPreviewOpen ? 'deck-preview-open' : '',
    artifactOpen ? '' : 'artifact-closed',
  ].filter(Boolean).join(' ')

  const sidebarWidth = useWorkbenchStore((s) => s.sidebarCollapsed) ? 72 : 238

  const layoutStyle = deckPreviewOpen ? (
    (() => {
      const viewportWidth = typeof window === 'undefined' ? 1366 : window.innerWidth
      const available = Math.max(1, viewportWidth - sidebarWidth - 8)
      const previewWidth = Math.round(available * deckPreviewRatio / 100)
      const leftWidth = available - previewWidth
      return ({ '--left-width': `${leftWidth}px`, '--preview-width': `${previewWidth}px` } as React.CSSProperties)
    })()
  ) : undefined

  return (
    <div className={`agent-app ${layoutClass}`} style={layoutStyle}>
      <Sidebar onSettings={() => setSettingsOpen(true)} onNotify={setToast} />
      <main className="agent-workspace">
        <Header />
        <div className="workspace-body">
          {phase === 'idle' && (
            <WelcomeStage onQuickStart={handleQuickStart} />
          )}
          {phase === 'clarify' && (
            <ClarificationFlow scenario={scenario} notes={clarificationNotes} />
          )}
          {phase !== 'idle' && phase !== 'clarify' && <Conversation />}
        </div>
        {phase === 'idle' ? (
          <div className="composer-wrap">
            <div className="composer">
              <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
                选择上方类型或快捷任务卡开始。
              </div>
            </div>
          </div>
        ) : phase === 'clarify' ? (
          <ClarificationComposer scenario={scenario} />
        ) : phase === 'searching' && searchProgress < 100 ? (
          <div className="composer-wrap composer-wrap-busy">
            <div className="composer-busy-state">
              <span>正在查找资料，完成后会请你确认引用资料</span>
            </div>
          </div>
        ) : (
          <Composer
            onApproveSources={() => {
              const id = useWorkbenchStore.getState().activeProjectId
              if (id) void useWorkbenchStore.getState().approveSources(id)
            }}
            onApproveOutline={() => {
              const id = useWorkbenchStore.getState().activeProjectId
              if (id) void useWorkbenchStore.getState().approveOutline(id)
            }}
          />
        )}
      </main>
      {artifactOpen && <ArtifactPanel />}
      <SourceDetailDrawer />
      <DeckPreviewDrawer />
      {deckPreviewOpen && <div style={{ width: 8, background: '#e8e7e2' }} aria-hidden="true" />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {briefPhase === 'asking' && <AskUserQuestionModal />}
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
  )
}