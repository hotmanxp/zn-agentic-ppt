import { getBriefFieldCopy } from "./briefCopy.js";
import { ChatTimeline } from "./ChatTimeline.js";
import type { Scenario } from "./data/types.js";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { UserMessage } from "./primitives/UserMessage.js";
import { useChatStore } from "../stores/chat.js";

export function ClarificationFlow({ scenario }: { scenario: Scenario; notes?: string[] }) {
  const copy = getBriefFieldCopy(scenario);
  const chatItems = useChatStore((s) => s.items);
  const retryQueueItem = useChatStore((s) => s.retry);
  const removeQueueItem = useChatStore((s) => s.removeQueueItem);
  return (
    <div className="conversation-stream clarification-stream" aria-live="polite">
      <UserMessage text={`我想生成一份${scenario.name}`} />
      <ChatTimeline
        items={chatItems}
        onRetry={retryQueueItem}
        onRemoveQueueItem={removeQueueItem}
      />
      <article className="message-row is-agent">
        <AgentIdentity />
        <div className="agent-message">
          <p>{copy.intro}</p>
        </div>
      </article>
    </div>
  );
}