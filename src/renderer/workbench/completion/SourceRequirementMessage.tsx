import { Check } from '@phosphor-icons/react'
import { AgentIdentity } from '../primitives/AgentIdentity.js'
import { UserMessage } from '../primitives/UserMessage.js'

export function SourceRequirementMessage({ text }: { text: string }) {
  return (
    <>
      <UserMessage text={text} />
      <article className="message-row is-agent">
        <AgentIdentity />
        <div className="agent-message simple-agent-reply">
          <p>已记录这条资料要求。我会按它调整资料筛选和大纲组织。</p>
          <span className="mini-status"><Check size={13} /> 已加入资料要求</span>
        </div>
      </article>
    </>
  )
}