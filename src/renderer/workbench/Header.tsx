import { Check, SpinnerGap } from "@phosphor-icons/react";
import { useWorkbenchStore } from "../stores/workbench.js";
import { PHASE_ORDER, type WorkbenchPhase } from "./data/types.js";

const FLOW_STEPS = ["选类型", "补信息", "找资料", "定大纲", "生成PPT"] as const;

function flowIndex(phase: WorkbenchPhase): number {
  if (phase === "clarify") return 1;
  if (phase === "searching" || phase === "sources") return 2;
  if (phase === "buildingOutline" || phase === "outline") return 3;
  if (phase === "generating" || phase === "complete") return 4;
  return -1;
}

interface HeaderProps {
  /** When set, header renders this title and hides phase-specific UI. */
  overrideTitle?: string;
}

export function Header({ overrideTitle }: HeaderProps = {}) {
  const phase = useWorkbenchStore((s) => s.phase);
  const scenarioName = useWorkbenchStore((s) => s.scenario.name);
  const client = useWorkbenchStore((s) => s.brief.client);
  const isRunning = phase === "generating" || phase === "searching" || phase === "buildingOutline";
  const isIdle = phase === "idle";
  const showOrb = !overrideTitle && (phase === "generating" || phase === "complete");
  const idx = flowIndex(phase);
  // Override title (e.g. settings view) wins; otherwise idle shows the
  // generic placeholder, non-idle uses brief.client or scenario name.
  const title = overrideTitle ?? (isIdle ? "新建演示任务" : client.trim() || scenarioName);
  const showPhaseChrome = !overrideTitle && !isIdle;

  return (
    <header className="workspace-header">
      <div className={`workspace-title ${isIdle && !overrideTitle ? "is-simple" : ""}`}>
        {showOrb && (
          <div className={`status-orb ${isRunning ? "is-running" : ""}`}>
            {isRunning ? <SpinnerGap size={15} /> : <Check size={14} weight="bold" />}
          </div>
        )}
        <div>
          <strong title={title}>{title}</strong>
          {showPhaseChrome && <span>{scenarioName}</span>}
        </div>
      </div>
      {showPhaseChrome && (
        <div className="flow-steps" aria-label="生成流程">
          {FLOW_STEPS.map((step, i) => (
            <span key={step} className={i < idx ? "is-done" : i === idx ? "is-active" : ""}>
              <i>{i < idx ? <Check size={10} weight="bold" /> : i + 1}</i>
              {step}
            </span>
          ))}
        </div>
      )}
      <div className="header-actions" />
    </header>
  );
}

export { PHASE_ORDER };
