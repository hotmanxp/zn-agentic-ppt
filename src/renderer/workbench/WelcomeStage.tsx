import { ArrowRight, FileText, Handshake, PresentationChart } from '@phosphor-icons/react'
import { SCENARIOS } from './data/scenarios.js'
import { BrandMark } from './primitives/BrandMark.js'

const ICONS = [<Handshake />, <PresentationChart />, <FileText />]

export function WelcomeStage({ onQuickStart }: { onQuickStart: (scenarioIdx: number) => void }) {
  const quickTasks = SCENARIOS.map((s, i) => ({ ...s, icon: ICONS[i] }))
  const creationSteps = [
    ['选类型', '选择要做的演示任务'],
    ['补信息', '确认主题、听众和目标'],
    ['找资料', '选择企业知识和补充材料'],
    ['定大纲', '先确认结构再生成'],
    ['生成PPT', '检查引用并导出 PPTX'],
  ]
  return (
    <section className="welcome-stage">
      <div className="welcome-symbol"><BrandMark /></div>
      <div className="welcome-eyebrow">知述 · Agent 工作台</div>
      <h1>今天想完成什么材料？</h1>
      <p className="welcome-copy">基于企业知识库，快速生成可追溯、可调整、可导出的专业演示材料。</p>
      <div className="creation-steps" aria-label="演示任务创建步骤">
        <span>创建流程</span>
        {creationSteps.map(([title, desc], idx) => (
          <div className="creation-step" key={title} title={desc}>
            <i>{idx + 1}</i>
            <b>{title}</b>
          </div>
        ))}
      </div>
      <div className="quick-task-grid">
        {quickTasks.map((item, idx) => (
          <button key={item.name} className="quick-task-card" onClick={() => onQuickStart(idx)}>
            <span>{item.icon}</span>
            <b>{item.name}</b>
            <small>{item.body}</small>
            <ArrowRight className="quick-arrow" size={17} />
          </button>
        ))}
      </div>
    </section>
  )
}