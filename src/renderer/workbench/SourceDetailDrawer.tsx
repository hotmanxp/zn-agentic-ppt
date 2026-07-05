import { CheckCircle, X } from "@phosphor-icons/react";
import { useWorkbenchStore } from "../stores/workbench.js";
import { KNOWN_SOURCES, getSourcePreview } from "./data/sources.js";
import type { SourceItem } from "./data/types.js";
import { SourceIcon } from "./primitives/SourceIcon.js";

export function SourceDetailDrawer() {
  const activeSourceId = useWorkbenchStore((s) => s.activeSourceId);
  const setActiveSource = useWorkbenchStore((s) => s.setActiveSource);
  const uploaded = useWorkbenchStore((s) => s.uploadedSources);

  const source: SourceItem | undefined = activeSourceId
    ? [...KNOWN_SOURCES, ...uploaded].find((s) => s.id === activeSourceId)
    : undefined;

  if (!source) return null;
  const preview = getSourcePreview(source);
  const snippets = [
    "核心观点：该资料与当前客户场景、行业背景和演示目标相关，可作为页面结论的主要依据。",
    `使用范围：建议用于${source.used}，生成时保留来源、版本和使用页面。`,
    source.status === "任务专用"
      ? "权限提示：该资料仅在本次任务中使用，不进入企业公共知识库。"
      : "权限提示：当前状态可用于本次演示材料草稿。",
  ];

  return (
    <aside className="source-detail-drawer" aria-label="引用资料详情">
      <div className="source-detail-header">
        <div>
          <SourceIcon type={source.type} />
          <span>
            <b>引用资料详情</b>
            <small>用于核对来源、版本和使用位置</small>
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="关闭引用资料详情"
          onClick={() => setActiveSource(null)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="source-detail-body">
        <div className="source-detail-title">
          <span className="source-file-icon">
            <SourceIcon type={source.type} />
          </span>
          <div>
            <strong>{source.title}</strong>
            <small>{source.library}</small>
          </div>
        </div>
        <div className="source-detail-grid">
          <div>
            <span>文件类型</span>
            <b>{source.type}</b>
          </div>
          <div>
            <span>版本时间</span>
            <b>{source.updated}</b>
          </div>
          <div>
            <span>创建人</span>
            <b>{preview.creator}</b>
          </div>
          <div>
            <span>创建时间</span>
            <b>{preview.createdAt}</b>
          </div>
          <div>
            <span>状态</span>
            <b>{source.status}</b>
          </div>
          <div>
            <span>使用页面</span>
            <b>{source.used}</b>
          </div>
        </div>
        <section className="source-detail-section">
          <h3>文件目录</h3>
          <ol className="source-directory-list">
            {preview.directory.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ol>
        </section>
        <section className="source-detail-section">
          <h3>文件内容预览</h3>
          <div className="source-content-preview">
            {preview.content.map((line, i) => (
              <p key={line}>
                <span>{i + 1}</span>
                {line}
              </p>
            ))}
          </div>
        </section>
        <section className="source-detail-section">
          <h3>Agent 摘要</h3>
          {snippets.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </section>
        <section className="source-detail-section">
          <h3>引用检查</h3>
          <div className="source-checklist">
            <span>
              <CheckCircle size={15} weight="fill" /> 来源可追溯
            </span>
            <span>
              <CheckCircle size={15} weight="fill" /> 版本信息完整
            </span>
            <span>
              <CheckCircle size={15} weight="fill" /> 生成时保留引用
            </span>
          </div>
        </section>
      </div>
    </aside>
  );
}
