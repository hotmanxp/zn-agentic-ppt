import { ArrowUpRight, Check, DownloadSimple, FilePpt } from '@phosphor-icons/react'
import { useWorkbenchStore } from '../../stores/workbench.js'
import type { Brief, DeckVersion, Scenario } from '../data/types.js'

export function CompletionCard({
  brief,
  scenario,
  version,
  versionNumber,
  isLatest,
  onOpenDeck,
}: {
  brief: Brief
  scenario: Scenario
  version: DeckVersion
  versionNumber: number
  isLatest: boolean
  onOpenDeck: () => void
}) {
  const setToast = useWorkbenchStore((s) => s.setToast)
  const deckName = `${brief.client || '演示稿'}_${scenario.name}_${version.pageCount}页${versionNumber ? `_V${versionNumber}` : ''}.pptx`

  const handleExport = () => {
    setToast('已完成可导出（PPTX 导出为后续工作）')
  }

  return (
    <div className={`completion-card ${isLatest ? 'is-latest' : ''}`}>
      <div className="completion-card-header">
        <div className="completion-check"><Check size={15} weight="bold" /></div>
        <div>
          <strong>{isLatest ? '演示材料已生成' : `历史版本 V${versionNumber}`}</strong>
          <p>
            {version.revision ? `根据「${version.revision}」重新生成，` : ''}
            已匹配企业模板，页面内容和引用来源完成检查。
          </p>
        </div>
        {versionNumber > 0 && (
          <span className="version-chip">
            {isLatest ? `当前版本 V${versionNumber}` : `V${versionNumber}`}
          </span>
        )}
      </div>
      <button className="completion-file-card" onClick={onOpenDeck} aria-label={`预览 ${deckName}`}>
        <span className="source-file-icon"><FilePpt size={18} /></span>
        <span>
          <b>{deckName}</b>
          <small>{version.pageCount} 页 · {version.sourceCount} 个知识来源</small>
        </span>
        <ArrowUpRight size={16} />
      </button>
      <div className="completion-summary">
        <p>{Math.max(1, version.pageCount - 1)} 页包含可追溯引用，最后一页为建议性结论。</p>
        <div className="completion-stats">
          <span><b>{version.pageCount}</b><small>页面</small></span>
          <span><b>{version.sourceCount}</b><small>知识来源</small></span>
          <span><b>100%</b><small>引用可追溯</small></span>
        </div>
      </div>
      <div className="inline-actions">
        <button className="secondary-action" onClick={onOpenDeck}>预览 PPT</button>
        <button className="primary-action" onClick={handleExport}>
          <DownloadSimple size={16} /> 导出可编辑 PPTX
        </button>
      </div>
    </div>
  )
}