import { Brain } from "@phosphor-icons/react";

export function ThinkingSummary({ text, title = "思考过程" }: { text: string; title?: string }) {
  return (
    <div className="thinking-summary">
      <span>
        <Brain size={14} />
      </span>
      <p>
        <b>{title}</b>
        {text}
      </p>
    </div>
  );
}
