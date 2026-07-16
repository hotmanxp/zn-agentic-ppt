import {
  Brain,
  CaretDown,
  CaretRight,
  CheckCircle,
  Circle,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { ExecutionStep } from "./data/executionSteps.js";
import { STEP_THINKING } from "./data/stepThinking.js";

export function GenerationThinkingPanel({
  steps,
  activeIndex,
  progress,
  complete,
  stepStates,
}: {
  steps: ExecutionStep[];
  activeIndex: number;
  progress: number;
  complete: boolean;
  stepStates?: Record<string, "pending" | "running" | "done" | "error">;
}) {
  const [open, setOpen] = useState(!complete);
  const completedCount = steps.filter((_, i) => progress >= (i + 1) * 20).length;
  const activeStep = steps[activeIndex];
  const summary = complete ? "已完成，点击查看详情" : `正在处理：${activeStep?.title ?? ""}`;

  useEffect(() => {
    setOpen(!complete);
  }, [complete]);

  return (
    <div className={`thinking-collapse ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="thinking-collapse-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="thinking-collapse-title">
          <Brain size={15} />
          <span>
            <b>生成步骤</b>
            <small>{summary}</small>
          </span>
        </span>
        <span className="thinking-collapse-state">
          {complete ? "已完成" : `${completedCount}/${steps.length}`}
          {open ? <CaretDown size={15} /> : <CaretRight size={15} />}
        </span>
      </button>
      {open && (
        <div className="thinking-collapse-body">
          <div className="thinking-inline-note">
            <span>
              <Brain size={14} />
            </span>
            <p>
              <b>{complete ? "检查完成" : (activeStep?.title ?? "")}</b>
              {complete
                ? "页面内容、引用来源和对外使用范围已完成检查。"
                : activeStep
                  ? (STEP_THINKING[activeStep.id] ?? "")
                  : ""}
            </p>
          </div>
          <div className="run-log">
            {steps.map((item, index) => {
              const threshold = (index + 1) * 20;
              const done = stepStates?.[item.id] === "done" || progress >= threshold;
              const active = stepStates?.[item.id] === "running" || (!done && index === activeIndex);
              return (
                <div
                  className={`${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
                  key={item.id}
                >
                  {done ? (
                    <CheckCircle size={16} weight="fill" />
                  ) : active ? (
                    <SpinnerGap size={16} />
                  ) : (
                    <Circle size={15} />
                  )}
                  <span>{item.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
