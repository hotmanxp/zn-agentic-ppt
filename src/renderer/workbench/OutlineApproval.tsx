import { PresentationChart } from "@phosphor-icons/react";
import type { Brief, OutlineItem } from "./data/types.js";

/**
 * Read-only summary card in the conversation flow ("已确认" record).
 * Edit affordance lives in the right-side OutlinePanel — clicking the
 * pencil icon on each card opens an inline editor.
 */
export function OutlineApproval({
  brief,
  outlineItems,
}: {
  brief: Brief;
  outlineItems: OutlineItem[];
}) {
  const pageCount = outlineItems.length;
  const requestedMinutes = Number.parseInt(brief.duration, 10);
  const speakingMinutes = Math.max(5, Math.round((requestedMinutes || pageCount * 2) / 5) * 5);

  return (
    <div className="approval-card">
      <div className="approval-icon">
        <PresentationChart size={20} />
      </div>
      <div className="approval-copy">
        <strong>先确认 {pageCount} 页大纲</strong>
        <p>
          右侧卡片可点击编辑标题、说明、引用来源，也可增加、删除或调整顺序。确认后再生成完整 PPT。
        </p>
        <div className="outline-readonly" aria-label="大纲预览（只读）">
          <div className="outline-readonly-topline">
            <span>预计讲述 {speakingMinutes} 分钟</span>
            <span className="outline-readonly-hint">右侧可编辑 →</span>
          </div>
          {outlineItems.map((item, index) => (
            <div className="outline-readonly-item" key={`${item.id}-${index}`}>
              <span className="outline-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="outline-readonly-fields">
                <b className="outline-readonly-title">{item.title}</b>
                {item.note && <p className="outline-readonly-note">{item.note}</p>}
                {item.source && <em className="outline-readonly-source">{item.source}</em>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
