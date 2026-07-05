import { Sparkle } from "@phosphor-icons/react";
import { useWorkbenchStore } from "../stores/workbench.js";
import { PHASE_ORDER } from "./data/types.js";

export function TaskPanel() {
  const brief = useWorkbenchStore((s) => s.brief);
  const phase = useWorkbenchStore((s) => s.phase);
  const rows = [
    ["客户", brief.client],
    ["听众", brief.audience],
    ["目标", brief.goal],
    ["时长", brief.duration],
    ["篇幅", brief.pages],
    ["模板", brief.template],
  ];
  const status = phase === "idle" ? "预设参数" : phase === "clarify" ? "待补全" : "已确认";
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  return (
    <div className="artifact-panel-body task-panel">
      <div className="panel-section-title">
        <b>任务简报</b>
        <span
          className={`status-chip ${phaseIdx >= PHASE_ORDER.indexOf("sources") ? "is-success" : ""}`}
        >
          {status}
        </span>
      </div>
      <div className="brief-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b className={!value ? "is-empty" : ""}>{value || "待填写"}</b>
          </div>
        ))}
      </div>
      <div className="panel-note">
        <Sparkle size={17} />
        <p>
          <b>Agent 判断</b>
          {phase === "clarify"
            ? "先明确对象与结果，再决定叙事结构和知识检索范围。"
            : "首次沟通应优先建立行业共识，避免一开始堆叠平台功能。"}
        </p>
      </div>
    </div>
  );
}
