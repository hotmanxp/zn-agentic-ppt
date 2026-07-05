import { Check, CheckCircle } from "@phosphor-icons/react";
import { useWorkbenchStore } from "../stores/workbench.js";
import { KNOWN_SOURCES } from "./data/sources.js";
import { SourceIcon } from "./primitives/SourceIcon.js";

export function SourcesPanel() {
  const uploaded = useWorkbenchStore((s) => s.uploadedSources);
  const selected = useWorkbenchStore((s) => s.selectedSources);
  const toggle = useWorkbenchStore((s) => s.toggleSource);
  const sources = [...KNOWN_SOURCES, ...uploaded];
  return (
    <div className="artifact-panel-body sources-panel">
      <div className="panel-section-title">
        <b>引用与知识来源</b>
        <span>{selected.length} 项已使用</span>
      </div>
      <div className="coverage-card">
        <div>
          <CheckCircle size={22} weight="fill" />
          <span>
            <b>引用检查通过</b>
            <small>事实型结论覆盖率 100%</small>
          </span>
        </div>
        <strong>100%</strong>
      </div>
      <div className="source-panel-list">
        {sources.map((s) => {
          const isSelected = selected.includes(s.id);
          return (
            <button
              className={isSelected ? "is-selected" : ""}
              key={s.id}
              onClick={() => toggle(s.id)}
              aria-pressed={isSelected}
            >
              <span className="source-file-icon">
                <SourceIcon type={s.type} />
              </span>
              <span>
                <b>{s.title}</b>
                <small>
                  {s.library} · {s.updated}
                </small>
                <em>{s.used}</em>
              </span>
              <span className="source-check">
                {isSelected && <Check size={14} weight="bold" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
