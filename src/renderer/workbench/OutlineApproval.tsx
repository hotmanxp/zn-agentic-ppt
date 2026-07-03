import { Plus, PresentationChart } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { useWorkbenchStore } from '../stores/workbench.js'
import { useOutlineStore } from '../stores/outline.js'
import type { Brief, OutlineItem } from './data/types.js'

export function OutlineApproval({
  brief,
  outlineItems,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
}: {
  brief: Brief
  outlineItems: OutlineItem[]
  onAddItem: () => void
  onUpdateItem: (idx: number, key: 'title' | 'note' | 'source', value: string) => void
  onRemoveItem: (idx: number) => void
  onMoveItem: (idx: number, dir: -1 | 1) => void
}) {
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId)
  const outlineUpdate = useOutlineStore((s) => s.updateSlide)
  const pageCount = outlineItems.length
  const requestedMinutes = Number.parseInt(brief.duration, 10)
  const speakingMinutes = Math.max(5, Math.round((requestedMinutes || pageCount * 2) / 5) * 5)

  // Debounced save: when the outline draft diverges from the persisted
  // outline, write changes via STAGE_OUTLINE_UPDATE.
  const lastSavedRef = useRef<string>(JSON.stringify(outlineItems))
  useEffect(() => {
    const snapshot = JSON.stringify(outlineItems)
    if (snapshot === lastSavedRef.current) return
    if (!activeProjectId) return
    const t = setTimeout(async () => {
      const persisted = useOutlineStore.getState().outline?.slides ?? []
      // Reconcile: for each draft item, find the persisted slide with same id and push the patch.
      for (let i = 0; i < outlineItems.length; i++) {
        const draft = outlineItems[i]
        const orig = persisted.find((s) => s.id === draft.id)
        if (!orig) continue
        const bullets = draft.note.split(/[·•]/).map((s) => s.trim()).filter(Boolean)
        const titleChanged = orig.title !== draft.title
        const bulletsChanged = JSON.stringify(orig.bullets) !== JSON.stringify(bullets)
        if (titleChanged || bulletsChanged) {
          try {
            await outlineUpdate(activeProjectId, draft.id, {
              title: draft.title,
              bullets: bullets.length > 0 ? bullets : [''],
            })
          } catch (e) {
            // best-effort; UI continues
          }
        }
      }
      lastSavedRef.current = snapshot
    }, 600)
    return () => clearTimeout(t)
  }, [outlineItems, activeProjectId, outlineUpdate])

  return (
    <div className="approval-card">
      <div className="approval-icon"><PresentationChart size={20} /></div>
      <div className="approval-copy">
        <strong>先确认 {pageCount} 页大纲</strong>
        <p>你可以直接修改标题、说明和引用来源，也可以增加、删除或调整顺序。确认后再生成完整 PPT。</p>
        <div className="outline-editor" aria-label="可编辑演示大纲">
          <div className="outline-editor-topline">
            <span>预计讲述 {speakingMinutes} 分钟</span>
            <button className="secondary-action" onClick={onAddItem}>
              <Plus size={15} /> 增加页面
            </button>
          </div>
          {outlineItems.map((item, index) => (
            <div className="outline-editor-item" key={`${item.id}-${index}`}>
              <span className="outline-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="outline-editor-fields">
                <input
                  value={item.title}
                  onChange={(e) => onUpdateItem(index, 'title', e.target.value)}
                  aria-label={`第 ${index + 1} 页标题`}
                />
                <textarea
                  value={item.note}
                  onChange={(e) => onUpdateItem(index, 'note', e.target.value)}
                  aria-label={`第 ${index + 1} 页说明`}
                  rows={1}
                />
                <input
                  value={item.source}
                  onChange={(e) => onUpdateItem(index, 'source', e.target.value)}
                  aria-label={`第 ${index + 1} 页引用来源`}
                />
              </div>
              <div className="outline-editor-actions">
                <button onClick={() => onMoveItem(index, -1)} disabled={index === 0}>上移</button>
                <button onClick={() => onMoveItem(index, 1)} disabled={index === outlineItems.length - 1}>下移</button>
                <button onClick={() => onRemoveItem(index)} disabled={outlineItems.length <= 1}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}