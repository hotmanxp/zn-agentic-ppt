import { ClockCounterClockwise } from "@phosphor-icons/react";
import type { ChatWorkflowEvent, ChatWorkflowEventType } from "@shared/types";
import { CompletionCard } from "./completion/CompletionCard.js";
import type { Brief, Scenario } from "./data/types.js";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { ConfirmedOutlineRecord } from "./primitives/ConfirmedOutlineRecord.js";
import { ConfirmedSourcesRecord } from "./primitives/ConfirmedSourcesRecord.js";
import { ConfirmedTaskRecord } from "./primitives/ConfirmedTaskRecord.js";

const STATUS_LABEL: Record<ChatWorkflowEventType, string> = {
  "project-created": "项目已创建",
  "brief-confirmed": "已确认任务要求",
  "sources-confirmed": "已确认引用资料",
  "outline-ready": "大纲已就绪",
  "outline-confirmed": "已确认演示大纲",
  "generation-started": "开始生成",
  "generation-completed": "演示材料已生成",
  "generation-failed": "生成失败",
  "generation-cancelled": "生成已取消",
  "revision-requested": "已记录修改要求",
  "revision-completed": "修改已完成",
};

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value === "string") return value;
  return null;
}

function readArray<T = unknown>(payload: Record<string, unknown>, key: string): T[] {
  const value = payload[key];
  if (Array.isArray(value)) return value as T[];
  return [];
}

function readRecord(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = payload[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function WorkflowEventCard({ event }: { event: ChatWorkflowEvent }) {
  // Incomplete payloads must not crash the list. Every branch falls
  // back to the compact status article at the bottom.
  const payload = event.payload ?? {};

  if (event.type === "brief-confirmed") {
    const brief = (readRecord(payload, "brief") ?? payload) as Partial<Brief> | null;
    const scenario = (readRecord(payload, "scenario") ?? {}) as Partial<Scenario>;
    if (brief && typeof brief === "object") {
      return (
        <ConfirmedTaskRecord
          scenario={(scenario.id ? (scenario as Scenario) : ({ id: "sales" } as Scenario))}
          brief={brief as Brief}
        />
      );
    }
  }

  if (event.type === "sources-confirmed") {
    const sources = readArray(payload, "sources");
    const selectedSources = readArray<string>(payload, "selectedSources");
    const sourceRequirements = readArray<string>(payload, "sourceRequirements");
    // Only fall back if the payload is missing the expected arrays entirely.
    const hasPayload =
      "sources" in payload ||
      "selectedSources" in payload ||
      "sourceRequirements" in payload;
    if (hasPayload) {
      return (
        <ConfirmedSourcesRecord
          sources={sources as never}
          selectedSources={selectedSources}
          sourceRequirements={sourceRequirements}
          onOpenSource={() => {}}
        />
      );
    }
  }

  if (event.type === "outline-ready" || event.type === "outline-confirmed") {
    const outlineItems = readArray(payload, "outlineItems");
    if ("outlineItems" in payload) {
      return <ConfirmedOutlineRecord outlineItems={outlineItems as never} />;
    }
  }

  if (event.type === "generation-completed") {
    const version = readRecord(payload, "version");
    const pageCount =
      typeof version?.pageCount === "number" ? version.pageCount : 1;
    const sourceCount =
      typeof version?.sourceCount === "number" ? version.sourceCount : 0;
    const brief = (readRecord(payload, "brief") ?? {}) as unknown as Brief;
    const scenario = (readRecord(payload, "scenario") ?? { id: "sales" }) as unknown as Scenario;
    return (
      <CompletionCard
        brief={brief}
        scenario={scenario}
        version={{
          id: event.id,
          pageCount,
          sourceCount,
          createdAt: event.createdAt,
          revision: readString(payload, "revision") ?? undefined,
          revisionId: readString(payload, "revisionId") ?? undefined,
        }}
        versionNumber={
          typeof payload.versionNumber === "number" ? payload.versionNumber : 1
        }
        isLatest
        onOpenDeck={() => {}}
      />
    );
  }

  // Default: compact status article.
  const label = STATUS_LABEL[event.type] ?? event.type;
  return (
    <article className="message-row is-agent">
      <AgentIdentity />
      <div className="agent-message">
        <div className="thinking-summary">
          <span>
            <ClockCounterClockwise size={14} />
          </span>
          <p>
            <b>{label}</b>
            {event.type === "generation-failed" && typeof payload.error === "string" ? (
              <span>{payload.error}</span>
            ) : (
              <span>{new Date(event.createdAt).toLocaleString()}</span>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}