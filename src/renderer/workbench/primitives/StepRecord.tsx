import type { ReactNode } from "react";
import { AgentIdentity } from "./AgentIdentity.js";

export function StepRecord({
  icon,
  title,
  meta,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta: string[];
  children: ReactNode;
}) {
  return (
    <article className="message-row is-agent is-step-record">
      <AgentIdentity />
      <div className="step-record-card">
        <span className="step-record-icon">{icon}</span>
        <div className="step-record-copy">
          <b>{title}</b>
          <div className="step-record-meta">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          {children}
        </div>
      </div>
    </article>
  );
}
