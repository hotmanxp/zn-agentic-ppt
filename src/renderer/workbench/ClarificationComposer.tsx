import { ArrowRight, FileText, Sparkle, Target, Timer, UsersThree } from "@phosphor-icons/react";
import { App as AntdApp } from "antd";
import { api } from "../lib/api.js";
import { useBriefOptimizeStore } from "../stores/briefOptimize.js";
import { useProjectStore } from "../stores/project.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { getBriefFieldCopy } from "./briefCopy.js";
import type { Scenario } from "./data/types.js";

const DURATION_OPTIONS = ["10 分钟", "15 分钟", "20 分钟", "30 分钟"];
const PAGE_OPTIONS = ["6 页", "8 页", "10 页", "12 页"];

export function ClarificationComposer({ scenario }: { scenario: Scenario }) {
  const copy = getBriefFieldCopy(scenario);
  const brief = useWorkbenchStore((s) => s.brief);
  const prompt = useWorkbenchStore((s) => s.prompt);
  const setPrompt = useWorkbenchStore((s) => s.setPrompt);
  const updateBrief = useWorkbenchStore((s) => s.updateBriefField);
  const useExample = useWorkbenchStore((s) => s.useExampleBrief);
  const startBriefOptimize = useBriefOptimizeStore((s) => s.start);
  const optimizePhase = useBriefOptimizeStore((s) => s.phase);
  const { message } = AntdApp.useApp();

  const ready =
    brief.client.trim() &&
    brief.audience.trim() &&
    brief.goal.trim() &&
    brief.duration.trim() &&
    brief.pages.trim();

  const handleConfirm = async () => {
    if (!ready) return;
    const state = useWorkbenchStore.getState();
    let id = state.activeProjectId;
    if (!id) {
      const title = brief.client.trim() || "新演示任务";
      const m = await api.project.create(title);
      await useProjectStore.getState().load();
      await state.openProject(m.id);
      id = m.id;
    }
    void state.confirmBrief(id);
  };

  const handleOptimize = async () => {
    const state = useWorkbenchStore.getState();
    let id = state.activeProjectId;
    if (!id) {
      const title = brief.client.trim() || "新演示任务";
      const m = await api.project.create(title);
      await useProjectStore.getState().load();
      await state.openProject(m.id);
      id = m.id;
    }
    try {
      await startBriefOptimize(id, null);
      message.success("项目信息已生成");
    } catch (e) {
      message.error(`优化失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="clarification-composer-wrap">
      <div className="clarification-card clarification-composer">
        <div className="clarification-header">
          <div>
            <Sparkle size={17} weight="fill" />
            <span>
              <b>先补充这几项</b>
              <small>{copy.header}</small>
            </span>
          </div>
          <span className="status-chip">待确认</span>
        </div>
        <div className="clarification-fields">
          <label className="brief-field is-wide">
            <span>
              {copy.primaryIcon} {copy.primaryLabel}
            </span>
            <input
              value={brief.client}
              onChange={(e) => updateBrief("client", e.target.value)}
              placeholder={copy.primaryPlaceholder}
              autoFocus
            />
          </label>
          <label className="brief-field is-wide">
            <span>
              <UsersThree size={15} /> {copy.audienceLabel}
            </span>
            <input
              value={brief.audience}
              onChange={(e) => updateBrief("audience", e.target.value)}
              placeholder={copy.audiencePlaceholder}
            />
          </label>
          <label className="brief-field is-wide">
            <span>
              <Target size={15} /> 目标
            </span>
            <input
              value={brief.goal}
              onChange={(e) => updateBrief("goal", e.target.value)}
              placeholder={copy.goalPlaceholder}
            />
          </label>
          <fieldset className="brief-choice-field">
            <legend>
              <Timer size={15} /> 时长
            </legend>
            <div>
              {DURATION_OPTIONS.map((value) => (
                <button
                  type="button"
                  aria-pressed={brief.duration === value}
                  className={brief.duration === value ? "is-selected" : ""}
                  key={value}
                  onClick={() => updateBrief("duration", value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="brief-choice-field">
            <legend>
              <FileText size={15} /> 篇幅
            </legend>
            <div>
              {PAGE_OPTIONS.map((value) => (
                <button
                  type="button"
                  aria-pressed={brief.pages === value}
                  className={brief.pages === value ? "is-selected" : ""}
                  key={value}
                  onClick={() => updateBrief("pages", value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="clarification-natural-input">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="补充任务背景"
            placeholder={copy.naturalPlaceholder}
            rows={2}
          />
        </div>
        <div className="clarification-footer">
          <div>
            <button className="secondary-action" onClick={useExample}>
              使用示例数据
            </button>
            <button
              className="secondary-action"
              onClick={handleOptimize}
              disabled={optimizePhase === "optimizing" || optimizePhase === "asking"}
              title="调用 LLM 优化项目信息"
            >
              <Sparkle size={14} weight="fill" />{" "}
              {optimizePhase === "optimizing" ? "优化中…" : "✨ 优化"}
            </button>
            <button className="primary-action" disabled={!ready} onClick={handleConfirm}>
              下一步，查找资料 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
