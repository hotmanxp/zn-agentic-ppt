import { Minus, PencilSimple, Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useOutlineStore } from "../stores/outline.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import type { OutlineItem } from "./data/types.js";

/**
 * Right-panel artifact cards. Default state is read-only display
 * (matches the in-conversation summary record). Clicking the
 * "..." button expands the card into an inline editor mirroring
 * the left-side OutlineApproval: title / note / source inputs, and
 * add / remove / move actions. The same debounced save effect
 * from OutlineApproval runs here so outline.json stays in sync.
 */
export function OutlinePanel({
  items,
  onNotify,
}: {
  items: OutlineItem[];
  onNotify: (msg: string) => void;
}) {
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId);
  const updateOutlineItem = useWorkbenchStore((s) => s.updateOutlineItem);
  const removeOutlineItem = useWorkbenchStore((s) => s.removeOutlineItem);
  const moveOutlineItem = useWorkbenchStore((s) => s.moveOutlineItem);
  const addOutlineItem = useWorkbenchStore((s) => s.addOutlineItem);
  const outlineUpdate = useOutlineStore((s) => s.updateSlide);

  // Debounced persist — same pattern as OutlineApproval.
  const lastSavedRef = useRef<string>(JSON.stringify(items));
  useEffect(() => {
    const snapshot = JSON.stringify(items);
    if (snapshot === lastSavedRef.current) return;
    if (!activeProjectId) return;
    const t = setTimeout(async () => {
      const persisted = useOutlineStore.getState().outline?.slides ?? [];
      for (let i = 0; i < items.length; i++) {
        const draft = items[i];
        const orig = persisted.find((s) => s.id === draft.id);
        if (!orig) continue;
        const bullets = draft.note
          .split(/[·•]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const titleChanged = orig.title !== draft.title;
        const bulletsChanged = JSON.stringify(orig.bullets) !== JSON.stringify(bullets);
        if (titleChanged || bulletsChanged) {
          try {
            await outlineUpdate(activeProjectId, draft.id, {
              title: draft.title,
              bullets: bullets.length > 0 ? bullets : [""],
            });
          } catch {
            // best-effort; UI continues
          }
        }
      }
      lastSavedRef.current = snapshot;
    }, 600);
    return () => clearTimeout(t);
  }, [items, activeProjectId, outlineUpdate]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="artifact-panel-body outline-panel">
      <div className="panel-section-title">
        <b>即将生成的大纲</b>
        <span>{items.length} 页</span>
      </div>
      <div className="outline-list">
        {items.map((item, index) => {
          const isOpen = expanded.has(item.id);
          return (
            <div
              key={item.id}
              className={`outline-list-card${isOpen ? " is-expanded" : ""}`}
            >
              <button
                className="outline-list-summary"
                onClick={() => toggle(item.id)}
                aria-expanded={isOpen}
                aria-label={`第 ${item.page} 页：${item.title}`}
              >
                <span className="outline-number">
                  {String(item.page).padStart(2, "0")}
                </span>
                <span className="outline-list-summary-copy">
                  <b>{item.title}</b>
                  {item.note && <small>{item.note}</small>}
                  {item.source && <em>{item.source}</em>}
                </span>
                {isOpen ? (
                  <Minus size={16} weight="bold" />
                ) : (
                  <PencilSimple size={16} aria-label="点击编辑" />
                )}
              </button>
              {isOpen && (
                <div className="outline-list-editor">
                  <label>
                    <span>标题</span>
                    <input
                      value={item.title}
                      onChange={(e) =>
                        updateOutlineItem(index, "title", e.target.value)
                      }
                      aria-label={`第 ${item.page} 页标题`}
                    />
                  </label>
                  <label>
                    <span>说明</span>
                    <textarea
                      value={item.note}
                      onChange={(e) =>
                        updateOutlineItem(index, "note", e.target.value)
                      }
                      aria-label={`第 ${item.page} 页说明`}
                      rows={2}
                    />
                  </label>
                  <label>
                    <span>引用来源</span>
                    <input
                      value={item.source}
                      onChange={(e) =>
                        updateOutlineItem(index, "source", e.target.value)
                      }
                      aria-label={`第 ${item.page} 页引用来源`}
                    />
                  </label>
                  <div className="outline-list-editor-actions">
                    <button
                      className="icon-only"
                      title="上移"
                      disabled={index === 0}
                      onClick={() => moveOutlineItem(index, -1)}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="icon-only"
                      title="下移"
                      disabled={index === items.length - 1}
                      onClick={() => moveOutlineItem(index, 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <button
                      className="danger"
                      disabled={items.length <= 1}
                      onClick={() => removeOutlineItem(index)}
                    >
                      删除
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        toggle(item.id);
                        onNotify(`已更新第 ${item.page} 页：${item.title}`);
                      }}
                    >
                      收起
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          className="outline-list-add"
          onClick={() => {
            void addOutlineItem();
          }}
        >
          <Plus size={14} /> 增加页面
        </button>
      </div>
    </div>
  );
}

export function OutlinePanelFromStore() {
  const items = useWorkbenchStore((s) => s.outlineDraft);
  const setToast = useWorkbenchStore((s) => s.setToast);
  return <OutlinePanel items={items} onNotify={setToast} />;
}
