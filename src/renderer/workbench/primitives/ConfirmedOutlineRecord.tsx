import { PresentationChart } from '@phosphor-icons/react'
import { StepRecord } from './StepRecord.js'
import type { OutlineItem } from '../data/types.js'

export function ConfirmedOutlineRecord({ outlineItems }: { outlineItems: OutlineItem[] }) {
  const pageCount = outlineItems.length
  const summary = outlineItems.slice(0, 3).map((it) => it.title).join('、')
  return (
    <StepRecord
      icon={<PresentationChart size={16} />}
      title="已确认演示大纲"
      meta={[`${pageCount} 页`, '先结构后生成', '引用随页面保留']}
    >
      <p>{summary}{pageCount > 3 ? '等页面' : ''}已进入生成队列，生成时会逐页绑定来源。</p>
    </StepRecord>
  )
}