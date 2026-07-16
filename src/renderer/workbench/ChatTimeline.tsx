import { CheckCircle, Circle, SpinnerGap, XCircle } from "@phosphor-icons/react";
import type { ChatQueueItem, ChatTimelineItem } from "@shared/types";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { UserMessage } from "./primitives/UserMessage.js";
import { ChatToolCard } from "./ChatToolCard.js";
import { WorkflowEventCard } from "./WorkflowEventCard.js";

const QUEUE_STATUS_LABEL: Record<ChatQueueItem["status"], string> = {
  queued: "等待中",
  submitted: "已提交",
  running: "处理中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function QueueRow({
  queue,
  onRetry,
  onRemoveQueueItem,
}: {
  queue: ChatQueueItem;
  onRetry: (queueId: string) => void;
  onRemoveQueueItem: (queueId: string) => void;
}) {
  const failed = queue.status === "failed" || queue.status === "cancelled";
  const statusClass = `chat-queue-item ${failed ? "is-error" : ""}`;
  const statusLabel = QUEUE_STATUS_LABEL[queue.status] ?? queue.status;
  return (
    <article className={statusClass} data-queue-status={queue.status}>
      <AgentIdentity />
      <div className="agent-message">
        <div className="thinking-summary">
          <span>
            {queue.status === "running" || queue.status === "submitted" ? (
              <SpinnerGap size={14} />
            ) : queue.status === "failed" ? (
              <XCircle size={14} />
            ) : queue.status === "completed" ? (
              <CheckCircle size={14} />
            ) : (
              <Circle size={14} />
            )}
          </span>
          <p>
            <b>{statusLabel}</b>
            <span>{queue.text}</span>
            {queue.error ? <span>· {queue.error.message}</span> : null}
          </p>
        </div>
        {failed && (
          <div className="chat-action-row">
            <button
              type="button"
              className="secondary-action"
              onClick={() => onRetry(queue.id)}
              aria-label={`重试：${queue.text}`}
            >
              重试
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onRemoveQueueItem(queue.id)}
              aria-label={`移除：${queue.text}`}
            >
              移除
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function MessageRow({ item }: { item: Extract<ChatTimelineItem, { kind: "message" }> }) {
  if (item.role === "user") {
    return <UserMessage text={item.text} />;
  }
  return (
    <article className="message-row is-agent">
      <AgentIdentity />
      <div className="agent-message">
        <p>{item.text}</p>
      </div>
    </article>
  );
}

export function ChatTimeline({
  items,
  onRetry,
  onRemoveQueueItem,
}: {
  items: ChatTimelineItem[];
  onRetry: (queueId: string) => void;
  onRemoveQueueItem: (queueId: string) => void;
}) {
  return (
    <div className="chat-timeline">
      {items.map((item) => {
        if (item.kind === "message") return <MessageRow key={item.id} item={item} />;
        if (item.kind === "tool") return <ChatToolCard key={item.id} item={item} />;
        if (item.kind === "workflow")
          return <WorkflowEventCard key={item.event.id} event={item.event} />;
        return (
          <QueueRow
            key={item.queue.id}
            queue={item.queue}
            onRetry={onRetry}
            onRemoveQueueItem={onRemoveQueueItem}
          />
        );
      })}
    </div>
  );
}