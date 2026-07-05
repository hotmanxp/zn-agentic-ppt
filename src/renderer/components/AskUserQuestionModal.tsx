import { Button, Checkbox, Modal, Radio } from "antd";
import { useState } from "react";
import { useBriefOptimizeStore } from "../stores/briefOptimize.js";

export function AskUserQuestionModal() {
  const phase = useBriefOptimizeStore((s) => s.phase);
  const current = useBriefOptimizeStore((s) => s.current);
  const answer = useBriefOptimizeStore((s) => s.answer);
  const cancel = useBriefOptimizeStore((s) => s.cancel);

  const [selected, setSelected] = useState<Record<string, string | string[]>>({});

  if (phase !== "asking" || !current) return null;

  const onConfirm = () => {
    answer(current.qid, selected);
    setSelected({});
  };
  const onCancelClick = () => {
    cancel();
    setSelected({});
  };

  const allAnswered = current.questions.every((q) => {
    const v = selected[q.question];
    if (v === undefined) return false;
    return Array.isArray(v) ? v.length > 0 : true;
  });

  return (
    <Modal
      open
      title={current.questions[0]?.header ?? "提问"}
      footer={null}
      closable={false}
      maskClosable={false}
      onCancel={onCancelClick}
    >
      {current.questions.map((q) => (
        <div key={q.question} style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 8px" }}>{q.question}</h4>
          {q.multiSelect ? (
            <Checkbox.Group
              options={q.options.map((o) => ({ label: o.label, value: o.label }))}
              onChange={(vals) => setSelected((s) => ({ ...s, [q.question]: vals as string[] }))}
            />
          ) : (
            <Radio.Group
              options={q.options.map((o) => ({ label: o.label, value: o.label }))}
              onChange={(e) => setSelected((s) => ({ ...s, [q.question]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <Button onClick={onCancelClick}>取消(走推断)</Button>
        <Button type="primary" disabled={!allAnswered} onClick={onConfirm}>
          确认
        </Button>
      </div>
    </Modal>
  );
}
