import { DotsThree } from "@phosphor-icons/react";
import { useWorkbenchStore } from "../stores/workbench.js";
import type { OutlineItem } from "./data/types.js";

export function OutlinePanel({
  items,
  onNotify,
}: {
  items: OutlineItem[];
  onNotify: (msg: string) => void;
}) {
  return (
    <div className="artifact-panel-body outline-panel">
      <div className="panel-section-title">
        <b>即将生成的大纲</b>
        <span>{items.length} 页</span>
      </div>
      <div className="outline-list">
        {items.map((item) => (
          <button
            key={item.page}
            onClick={() => onNotify(`已选中第 ${item.page} 页：${item.title}`)}
          >
            <span className="outline-number">{String(item.page).padStart(2, "0")}</span>
            <span>
              <b>{item.title}</b>
              <small>{item.note}</small>
              <em>{item.source}</em>
            </span>
            <DotsThree size={17} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function OutlinePanelFromStore() {
  const items = useWorkbenchStore((s) => s.outlineDraft);
  const setToast = useWorkbenchStore((s) => s.setToast);
  return <OutlinePanel items={items} onNotify={setToast} />;
}
