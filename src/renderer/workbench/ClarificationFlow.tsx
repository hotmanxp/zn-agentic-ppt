import { Check } from "@phosphor-icons/react";
import { getBriefFieldCopy } from "./briefCopy.js";
import type { Scenario } from "./data/types.js";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { UserMessage } from "./primitives/UserMessage.js";

export function ClarificationFlow({ scenario, notes }: { scenario: Scenario; notes: string[] }) {
  const copy = getBriefFieldCopy(scenario);
  return (
    <div className="conversation-stream clarification-stream" aria-live="polite">
      <UserMessage text={`我想生成一份${scenario.name}`} />
      <article className="message-row is-agent">
        <AgentIdentity />
        <div className="agent-message">
          <p>{copy.intro}</p>
        </div>
      </article>
      {notes.map((note, index) => (
        <div key={`${note}-${index}`}>
          <UserMessage text={note} />
          <article className="message-row is-agent">
            <AgentIdentity />
            <div className="agent-message simple-agent-reply">
              <p>已记录这条背景信息。我会把它纳入任务理解，请继续确认上方结构化信息。</p>
              <span className="mini-status">
                <Check size={13} /> 已加入任务上下文
              </span>
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}
