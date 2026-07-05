import {
  ArrowRight,
  CaretDown,
  Check,
  FolderSimple,
  PaperPlaneTilt,
  SpinnerGap,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { KNOWN_SOURCES } from "./data/sources.js";
import type { SourceItem, WorkbenchPhase } from "./data/types.js";
import { SourceIcon } from "./primitives/SourceIcon.js";

interface ComposerProps {
  onApproveSources: () => void;
  onApproveOutline: () => void;
  /** Re-runs outline generation with the same brief (no edits). */
  onRegenerateOutline: () => void;
}

const PLACEHOLDERS: Record<WorkbenchPhase, string> = {
  idle: "可以选择上方类型，也可以直接输入具体任务，例如：做一份发布会演讲稿，发布知鸟 AI 陪练，20 分钟…",
  clarify: "补充其他背景信息…",
  sources: "补充资料要求，例如：优先使用客户案例，避免使用过期版本…",
  buildingOutline: "正在生成大纲…",
  outline: "提出大纲修改要求，例如：减少技术细节，增加客户价值和落地路径…",
  searching: "正在查找资料…",
  generating: "正在生成 PPT…",
  complete: "继续提出修改要求…",
};

export function Composer({ onApproveSources, onApproveOutline, onRegenerateOutline }: ComposerProps) {
  const phase = useWorkbenchStore((s) => s.phase);
  const prompt = useWorkbenchStore((s) => s.prompt);
  const setPrompt = useWorkbenchStore((s) => s.setPrompt);
  const submitPrompt = useWorkbenchStore((s) => s.submitPrompt);
  const sourceMenu = useWorkbenchStore((s) => s.sourceMenuOpen);
  const setSourceMenu = useWorkbenchStore((s) => s.setSourceMenuOpen);
  const selectedSources = useWorkbenchStore((s) => s.selectedSources);
  const toggleSource = useWorkbenchStore((s) => s.toggleSource);
  const uploadMaterials = useWorkbenchStore((s) => s.uploadMaterials);
  const setToast = useWorkbenchStore((s) => s.setToast);
  const uploadedSources = useWorkbenchStore((s) => s.uploadedSources);

  const uploadRef = useRef<HTMLInputElement>(null);
  const isBusy = phase === "searching" || phase === "buildingOutline" || phase === "generating";

  const grouped = useMemo(() => {
    const all: SourceItem[] = [...KNOWN_SOURCES, ...uploadedSources];
    return all.reduce(
      (acc, s) => {
        const key = s.library || "未分类资料";
        (acc[key] ||= []).push(s);
        return acc;
      },
      {} as Record<string, SourceItem[]>,
    );
  }, [uploadedSources]);

  const totalCount = useMemo(
    () => Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0),
    [grouped],
  );

  const submit = () => {
    const text = prompt.trim();
    if (!text) return;
    void submitPrompt(text);
  };

  if (isBusy) {
    const cancelable = phase === "buildingOutline" || phase === "generating";
    return (
      <div className="composer-wrap composer-wrap-busy">
        <div className="composer-busy-state">
          <SpinnerGap size={16} />
          <span>
            {phase === "searching"
              ? "正在查找资料，完成后会请你确认引用资料"
              : phase === "buildingOutline"
                ? "正在生成大纲，完成后会请你确认大纲"
                : "正在生成 PPT，完成后会自动进入预览"}
          </span>
          {cancelable && (
            <button
              className="quiet-button"
              style={{ marginLeft: 12 }}
              onClick={() => {
                if (phase === "buildingOutline") void useStageStreamStore.getState().cancel();
                else void usePptGenerationStore.getState().cancel();
              }}
              aria-label="取消"
            >
              <X size={14} /> 取消
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="composer-wrap">
      {phase === "complete" && (
        <div className="suggestion-row" aria-label="快捷修改建议">
          <button onClick={() => void submitPrompt("第 2 页更强调银行合规与审计要求")}>
            加强合规论证
          </button>
          <button onClick={() => void submitPrompt("把整份材料压缩到 10 分钟")}>
            压缩到 10 分钟
          </button>
          <button onClick={() => void submitPrompt("给每一页补充讲述备注")}>补充讲述备注</button>
        </div>
      )}
      {phase === "sources" && (
        <div className="source-confirm-card">
          <div>
            <b>资料确认后，我会生成大纲</b>
            <span>
              当前采用 {selectedSources.length} 份资料。你也可以先在下方补充筛选要求或上传资料。
            </span>
          </div>
          <button className="confirm-sources-button" onClick={onApproveSources}>
            确认资料，生成大纲 <ArrowRight size={15} />
          </button>
        </div>
      )}
      {phase === "outline" && (
        <div className="outline-decision-card">
          <div>
            <b>请确认大纲</b>
            <span>确认后开始生成；也可重新生成或补充要求。</span>
          </div>
          <div className="outline-decision-actions">
            <button className="secondary-action" onClick={onRegenerateOutline}>
              重新生成大纲
            </button>
            {prompt.trim() && (
              <button className="secondary-action" onClick={submit}>
                按修改要求重生成
              </button>
            )}
            <button className="primary-action" onClick={onApproveOutline}>
              确认大纲，开始生成 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="composer">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={PLACEHOLDERS[phase]}
          aria-label="任务输入"
          rows={2}
        />
        <div className="composer-toolbar">
          <div className="composer-left-actions">
            <div className="source-menu-wrap">
              {sourceMenu && (
                <div className="source-popover">
                  <div className="source-popover-header">
                    <b>知鸟知识库</b>
                    <span>
                      已选 {selectedSources.length}/{totalCount}
                    </span>
                  </div>
                  {Object.entries(grouped).map(([directory, items]) => (
                    <div className="source-popover-section" key={directory}>
                      <span className="source-popover-directory">
                        <FolderSimple size={14} /> {directory}
                      </span>
                      {items.map((s) => {
                        const selected = selectedSources.includes(s.id);
                        return (
                          <button
                            className="source-popover-file"
                            key={s.id}
                            onClick={() => toggleSource(s.id)}
                            aria-pressed={selected}
                          >
                            <SourceIcon type={s.type} size={16} />
                            <span>{s.title}</span>
                            <span className={`tiny-check ${selected ? "is-selected" : ""}`}>
                              {selected && <Check size={12} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="context-pill" onClick={() => uploadRef.current?.click()}>
              <UploadSimple size={15} /> 上传资料
            </button>
            <input
              className="composer-upload-input"
              ref={uploadRef}
              type="file"
              multiple
              accept=".ppt,.pptx,.pdf,.doc,.docx,.txt,.md"
              onChange={(e) => {
                uploadMaterials(e.target.files);
                e.target.value = "";
              }}
            />
            <button className="context-pill" onClick={() => setSourceMenu(!sourceMenu)}>
              <FolderSimple size={15} /> 知识库 <CaretDown size={13} />
            </button>
          </div>
          <div className="composer-right-actions">
            <button
              className="send-button"
              onClick={submit}
              disabled={!prompt.trim()}
              aria-label="发送任务"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
