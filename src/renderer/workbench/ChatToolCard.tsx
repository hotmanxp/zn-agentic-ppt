import { CaretDown, CaretRight, Wrench } from "@phosphor-icons/react";
import { useState } from "react";
import type { ChatTimelineItem } from "@shared/types";

type ToolItem = Extract<ChatTimelineItem, { kind: "tool" }>;

const STATUS_LABEL: Record<ToolItem["status"], string> = {
  running: "进行中",
  done: "已完成",
  error: "失败",
  denied: "已拒绝",
};

function format(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ChatToolCard({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(true);
  const label = STATUS_LABEL[item.status] ?? item.status;
  return (
    <div className="tool-call-card" data-tool-status={item.status}>
      <button
        type="button"
        className="tool-call-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-icon">
          <Wrench size={16} />
        </span>
        <span>
          <b>{item.name}</b>
          <small>{label}</small>
        </span>
        <span className="tool-duration">{item.toolUseId}</span>
        {open ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>
      {open && (
        <div className="tool-call-content">
          <div className="chat-tool-output">
            <span>输入</span>
            <pre>{format(item.input)}</pre>
          </div>
          {item.output !== undefined && (
            <div className="chat-tool-output">
              <span>输出</span>
              <pre>{format(item.output)}</pre>
            </div>
          )}
          {item.status === "error" && (
            <div className="chat-tool-output">
              <span>错误</span>
              <pre>{String((item as { error?: string }).error ?? "")}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}