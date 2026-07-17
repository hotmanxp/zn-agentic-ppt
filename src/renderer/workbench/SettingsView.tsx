import { App as AntdApp, Button, Form, Input, Select, Switch } from "antd";
import { useEffect, useState } from "react";
import { PromptSettings } from "../components/PromptSettings.js";
import { useSettingsStore } from "../stores/settings.js";
import {
  OPEN_PLATFORM_BASE_URL,
  OPEN_PLATFORM_CREDENTIAL_PATH,
} from "../../shared/types.js";

const TABS = [
  { key: "llm", label: "LLM 服务" },
  { key: "prompts", label: "提示词" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function SettingsView() {
  const [tab, setTab] = useState<TabKey>("llm");

  return (
    <div className="settings-view">
      <div className="settings-view-inner">
        <div className="settings-view-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`settings-view-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="settings-view-panel">
          {tab === "llm" ? <LLMForm /> : <PromptSettings />}
        </div>
      </div>
    </div>
  );
}

function LLMForm() {
  const { settings, load, save } = useSettingsStore();
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    models?: string[];
    error?: string;
  } | null>(null);
  const [form, setForm] = useState(settings);
  const { message } = AntdApp.useApp();

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setForm(settings);
  }, [settings]);
  if (!form) return <div className="settings-view-loading">加载中...</div>;

  const update = (patch: Partial<typeof form.llm>) =>
    setForm((s) => (s ? { ...s, llm: { ...s.llm, ...patch } } : s));

  return (
    <div className="settings-llm-form">
      <h2 className="settings-form-title">LLM 服务</h2>
      <p className="settings-form-subtitle">
        配置用于生成 PPT 的 LLM 服务。设置存在本地，不会发送到外部。
      </p>
      <Form layout="vertical">
        <Form.Item label="服务提供方">
          <Select
            value={form.llm.provider}
            onChange={(v) => update({ provider: v })}
            options={[
              { value: "anthropic", label: "Anthropic 兼容（默认）" },
              { value: "openai", label: "OpenAI 兼容" },
              { value: "custom", label: "自定义" },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="使用开放平台登录"
          extra="开启后使用固定开放平台地址，并读取本机开放平台登录凭据。"
        >
          <Switch
            aria-label="使用开放平台登录"
            checked={form.llm.useOpenPlatform}
            onChange={(checked) => {
              update({ useOpenPlatform: checked });
              setTestResult(null);
            }}
          />
        </Form.Item>
        <Form.Item label="API Base URL">
          <Input
            aria-label="API Base URL"
            value={form.llm.useOpenPlatform ? OPEN_PLATFORM_BASE_URL : form.llm.baseUrl}
            disabled={form.llm.useOpenPlatform}
            onChange={(e) => update({ baseUrl: e.target.value })}
            style={{ fontFamily: "monospace" }}
          />
        </Form.Item>
        <Form.Item
          label="API Key"
          extra={
            form.llm.useOpenPlatform
              ? `读取自 ${OPEN_PLATFORM_CREDENTIAL_PATH}`
              : "存储于本地，明文。后续版本将加密。"
          }
        >
          <Input.Password
            aria-label="API Key"
            value={form.llm.useOpenPlatform ? "" : form.llm.apiKey}
            placeholder={
              form.llm.useOpenPlatform
                ? `读取自 ${OPEN_PLATFORM_CREDENTIAL_PATH}`
                : undefined
            }
            disabled={form.llm.useOpenPlatform}
            onChange={(e) => update({ apiKey: e.target.value })}
            style={{ fontFamily: "monospace" }}
          />
        </Form.Item>
        <Form.Item label="模型" extra="留空使用服务默认模型">
          <Input
            value={form.llm.model}
            onChange={(e) => update({ model: e.target.value })}
            style={{ fontFamily: "monospace" }}
            addonAfter={
              <Button
                size="small"
                type="link"
                onClick={async () => {
                  try {
                    const r = await window.api.settings.testConnection(form);
                    setTestResult(r);
                    if (r.ok) message.success(`连接成功，${r.models?.length ?? 0} 个模型`);
                    else message.error(r.error ?? "连接失败");
                  } catch (e) {
                    message.error(String(e));
                  }
                }}
              >
                测试连接
              </Button>
            }
          />
        </Form.Item>
        {testResult && (
          <div
            className={`settings-test-result ${testResult.ok ? "is-ok" : "is-fail"}`}
          >
            {testResult.ok
              ? `✓ 连接成功${testResult.models ? `，模型：${testResult.models.join(", ")}` : ""}`
              : `✗ ${testResult.error}`}
          </div>
        )}
        <div className="settings-form-footer">
          <Button onClick={() => setForm(settings)}>恢复</Button>
          <Button
            type="primary"
            onClick={async () => {
              if (form) {
                await save(form);
                message.success("已保存");
              }
            }}
          >
            保存设置
          </Button>
        </div>
      </Form>
    </div>
  );
}