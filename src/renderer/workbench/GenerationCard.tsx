import { Check, SpinnerGap } from "@phosphor-icons/react";
import { useIntentGenerationStore } from "../stores/intentGeneration.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { GenerationThinkingPanel } from "./GenerationThinkingPanel.js";
import { EXECUTION_STEPS } from "./data/executionSteps.js";
import type { Brief } from "./data/types.js";

export function GenerationCard({ progress, brief }: { progress: number; brief: Brief }) {
  const complete = progress >= 100;
  const intentPhase = useIntentGenerationStore((s) => s.phase);
  const outlinePhase = useStageStreamStore((s) => s.phase);
  const htmlPhase = usePptGenerationStore((s) => s.phase);
  if (complete) return null;
  const activeIndex = Math.min(EXECUTION_STEPS.length - 1, Math.floor(progress / 20));
  const stepStates: Record<string, "pending" | "running" | "done" | "error"> = {
    intent:
      intentPhase === "done" ? "done"
      : intentPhase === "running" ? "running"
      : intentPhase === "error" ? "error"
      : "pending",
    search: "pending",
    outline:
      outlinePhase === "streaming" ? "running"
      : outlinePhase === "done" ? "done"
      : outlinePhase === "error" ? "error"
      : "pending",
    compose:
      htmlPhase === "running" ? "running"
      : htmlPhase === "done" ? "done"
      : htmlPhase === "error" ? "error"
      : "pending",
    verify: "pending",
  };
  return (
    <div className="generation-card">
      <div className="generation-topline">
        <span className="run-icon">
          <SpinnerGap size={16} />
        </span>
        <div>
          <b>大纲已确认，开始生成</b>
          <small>我会自动生成页面并检查引用，过程中会保留每一步处理记录。</small>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <GenerationThinkingPanel
        steps={EXECUTION_STEPS}
        activeIndex={activeIndex}
        progress={progress}
        complete={complete}
        stepStates={stepStates}
      />
      <small style={{ color: "var(--muted)", fontSize: 12 }}>
        按 {brief.duration} 节奏组织 {brief.pages} 结构
      </small>
    </div>
  );
}
