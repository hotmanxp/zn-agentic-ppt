import { App as AntdApp, Button, Input, Modal } from "antd";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export interface PromptSpec {
  id: string;
  title: string;
  description: string;
  defaultTemplate: string;
  variables: Array<{
    name: string;
    description: string;
    type: "string" | "json";
    example?: string;
  }>;
}

export function PromptSettings() {
  const [specs, setSpecs] = useState<PromptSpec[] | null>(null);
  const { modal, message } = AntdApp.useApp();

  useEffect(() => {
    api.settings.prompts.listSpecs().then(setSpecs);
  }, []);

  const handleReset = async (id: string) => {
    modal.confirm({
      title: "重置提示词？",
      content: "将恢复为默认模板，覆盖当前自定义内容。",
      okText: "重置",
      cancelText: "取消",
      onOk: async () => {
        await api.settings.prompts.reset(id);
        message.success("已重置为默认模板");
      },
    });
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px" }}>提示词</h2>
      <p style={{ color: "#6b7280", margin: "0 0 24px", fontSize: 14 }}>
        自定义每个 agent 提示词。可用 <code>{"{{name}}"}</code> 引用运行时变量。修改后可重置回默认。
      </p>
      {!specs && <div style={{ color: "#9ca3af" }}>加载中...</div>}
      {specs &&
        specs.map((spec) => (
          <PromptCard key={spec.id} spec={spec} onReset={() => handleReset(spec.id)} />
        ))}
    </div>
  );
}

function PromptCard({ spec, onReset }: { spec: PromptSpec; onReset: () => void }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.settings.prompts.get(spec.id).then((t) => setTemplate(t ?? spec.defaultTemplate));
  }, [spec.id, spec.defaultTemplate]);

  if (template === null) return <div style={{ color: "#9ca3af" }}>加载 {spec.title}…</div>;

  const handleSave = async () => {
    await api.settings.prompts.set(spec.id, template);
    setDirty(false);
    AntdApp.useApp().message.success("已保存");
  };

  return (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        background: "#fafafa",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <h3 style={{ margin: 0 }}>{spec.title}</h3>
        <code style={{ fontSize: 12, color: "#6b7280" }}>{spec.id}</code>
      </div>
      <p style={{ color: "#6b7280", margin: "0 0 12px", fontSize: 13 }}>{spec.description}</p>
      <Input.TextArea
        value={template}
        onChange={(e) => {
          setTemplate(e.target.value);
          setDirty(true);
        }}
        autoSize={{ minRows: 6, maxRows: 18 }}
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />
      {spec.variables.length > 0 && (
        <div className="prompt-variables">
          <div className="prompt-variables-label">模板变量</div>
          <ul className="prompt-variables-list">
            {spec.variables.map((v) => (
              <li key={v.name} className="prompt-variable">
                <span className={`prompt-variable-type ${v.type === "json" ? "is-json" : ""}`}>{v.type}</span>
                <code className="prompt-variable-name">{`{{${v.name}}}`}</code>
                <span className="prompt-variable-desc">{v.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <Button onClick={onReset}>重置为默认</Button>
        <Button type="primary" disabled={!dirty} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  );
}
