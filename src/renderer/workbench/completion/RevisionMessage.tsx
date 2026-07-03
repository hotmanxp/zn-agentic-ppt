import { Check } from '@phosphor-icons/react'
import { AgentIdentity } from '../primitives/AgentIdentity.js'
import { ThinkingSummary } from '../primitives/ThinkingSummary.js'
import { UserMessage } from '../primitives/UserMessage.js'

export function RevisionMessage({ revision }: { revision: { id: string; text: string } | string }) {
  const text = typeof revision === 'string' ? revision : revision.text
  return (
    <>
      <UserMessage text={text} />
      <article className="message-row is-agent">
        <AgentIdentity />
        <div className="agent-message simple-agent-reply">
          <p>已记录修改要求。我会保留当前结构，只调整对应页面的论证重点，并继续沿用已审核的知识证据。</p>
          <ThinkingSummary title="修改判断" text="优先局部调整受影响页面，保持已确认的大纲、其他页面和引用关系稳定。" />
          <span className="mini-status"><Check size={13} /> 已同步到演示稿</span>
        </div>
      </article>
    </>
  )
}