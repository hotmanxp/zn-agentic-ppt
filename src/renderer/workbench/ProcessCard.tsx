import { CheckCircle, Circle, SpinnerGap } from "@phosphor-icons/react";

interface ProcessStep {
  title: string;
  detail: string;
}

export function ProcessCard({
  title,
  description,
  progress,
  steps,
}: {
  title: string;
  description: string;
  progress: number;
  steps: ProcessStep[];
}) {
  const activeIndex = Math.min(
    steps.length - 1,
    Math.floor(Math.max(progress - 1, 0) / (100 / steps.length)),
  );
  const complete = progress >= 100;
  return (
    <div className="process-card">
      <div className="process-card-header">
        <span className={`run-icon ${complete ? "is-done" : "is-running"}`}>
          {complete ? <CheckCircle size={16} weight="fill" /> : <SpinnerGap size={16} />}
        </span>
        <div>
          <b>{title}</b>
          <small>{description}</small>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="process-step-list">
        {steps.map((step, index) => {
          const threshold = (index + 1) * (100 / steps.length);
          const done = progress >= threshold;
          const active = !done && index === activeIndex;
          return (
            <div
              className={`${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
              key={step.title}
            >
              {done ? (
                <CheckCircle size={16} weight="fill" />
              ) : active ? (
                <SpinnerGap size={16} />
              ) : (
                <Circle size={15} />
              )}
              <span>
                <b>{step.title}</b>
                <small>{step.detail}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
