import { ArrowUpRight, PresentationChart, SidebarSimple, X } from '@phosphor-icons/react'
import { useWorkbenchStore } from '../stores/workbench.js'
import { TaskPanel } from './TaskPanel.js'
import { SourcesPanel } from './SourcesPanel.js'
import { OutlinePanelFromStore } from './OutlinePanel.js'
import { DeckPanel } from './DeckPanel.js'
import { GenerationProgressPanel } from './GenerationProgressPanel.js'

export function ArtifactPanel() {
  const phase = useWorkbenchStore((s) => s.phase)
  const artifactTab = useWorkbenchStore((s) => s.artifactTab)
  const setArtifactTab = useWorkbenchStore((s) => s.setArtifactTab)
  const toggleArtifact = useWorkbenchStore((s) => s.toggleArtifact)
  const setActiveSource = useWorkbenchStore((s) => s.setActiveSource)
  const setToast = useWorkbenchStore((s) => s.setToast)
  const outlineItems = useWorkbenchStore((s) => s.outlineDraft)
  const selectedSlideIdx = useWorkbenchStore((s) => s.selectedSlide)
  const brief = useWorkbenchStore((s) => s.brief)

  const resolveSourceForCurrentSlide = () => {
    const item = outlineItems[selectedSlideIdx]
    const src = (item?.source ?? '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)[0]
    return src || 'solution'
  }

  const handleOpenSourceForSlide = () => {
    const id = resolveSourceForCurrentSlide()
    setArtifactTab('sources')
    setActiveSource(id)
    setToast(`已定位到引用来源：${id}`)
  }

  const tabs: Array<{ id: 'deck' | 'sources' | 'task'; label: string }> = [
    { id: 'deck', label: '演示稿' },
    { id: 'sources', label: '引用' },
    { id: 'task', label: '任务' },
  ]

  const subtitle =
    phase === 'sources' ? '请确认资料'
      : phase === 'outline' ? '请确认大纲'
        : phase === 'generating' ? '正在生成'
          : phase === 'complete' ? '可预览导出'
            : '自动保存'

  return (
    <aside className="artifact-panel" aria-label="当前成果">
      <div className="artifact-header">
        <div>
          <PresentationChart size={18} />
          <span><b>当前成果</b><small>{subtitle}</small></span>
        </div>
        <button className="icon-button" aria-label="收起产物面板" onClick={toggleArtifact}>
          <SidebarSimple size={18} />
        </button>
      </div>
      <div className="artifact-tabs" role="tablist" aria-label="产物视图">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={artifactTab === tab.id}
            className={artifactTab === tab.id ? 'is-active' : ''}
            onClick={() => setArtifactTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {artifactTab === 'task' && <TaskPanel />}

      {artifactTab === 'sources' && <SourcesPanel />}

      {artifactTab === 'deck' && (phase === 'idle' || phase === 'clarify' || phase === 'searching') && (
        <TaskPanel />
      )}
      {artifactTab === 'deck' && phase === 'sources' && <SourcesPanel />}
      {artifactTab === 'deck' && (phase === 'buildingOutline' || phase === 'outline') && (
        <OutlinePanelFromStore />
      )}
      {artifactTab === 'deck' && (phase === 'generating' || phase === 'complete') && (
        <GenerationProgressPanel brief={brief} />
      )}
      {artifactTab === 'deck' && phase === 'complete' && (
        <DeckPanel onOpenSource={handleOpenSourceForSlide} />
      )}
    </aside>
  )
}