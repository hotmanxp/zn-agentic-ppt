import { ArrowLeft, ArrowRight, FilePpt, X } from '@phosphor-icons/react'
import { useWorkbenchStore } from '../stores/workbench.js'
import { DeckPanel } from './DeckPanel.js'
import { usePptGenerationStore } from '../stores/pptGeneration.js'

export function DeckPreviewDrawer() {
  const open = useWorkbenchStore((s) => s.deckPreviewOpen)
  const closePreview = useWorkbenchStore((s) => s.closeDeckPreview)
  const setActiveSource = useWorkbenchStore((s) => s.setActiveSource)
  const setArtifactTab = useWorkbenchStore((s) => s.setArtifactTab)
  const setToast = useWorkbenchStore((s) => s.setToast)
  const slides = usePptGenerationStore((s) => s.slides)
  const slideCount = Object.values(slides).length

  if (!open) return null

  return (
    <aside className="deck-preview-panel" aria-label="PPT预览">
      <div className="source-detail-header">
        <div><FilePpt size={18} /><span><b>PPT预览</b></span></div>
        <button className="icon-button" aria-label="关闭 PPT 预览" onClick={closePreview}>
          <X size={18} />
        </button>
      </div>
      <div className="source-detail-body deck-preview-body">
        <div className="source-detail-title deck-preview-title">
          <span className="source-file-icon"><FilePpt size={18} /></span>
          <div>
            <strong>当前演示稿</strong>
            <small>{slideCount} 页 · 实时生成中</small>
          </div>
        </div>
        <DeckPanel
          onOpenSource={() => {
            closePreview()
            setArtifactTab('sources')
            setActiveSource('solution')
            setToast('已定位到本页引用来源')
          }}
        />
      </div>
    </aside>
  )
}