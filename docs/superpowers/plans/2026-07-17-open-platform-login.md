# 开放平台登录切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 LLM 设置中增加“使用开放平台登录”开关，并让所有 LLM 调用在开关开启时统一使用固定 Base URL 和 Electron 启动时读取的本地开放平台 token。

**Architecture:** 把开放平台认证状态集中在 `src/main/sdk/zai-bridge.ts` 的 `createModelCaller()` 边界，因为 PPT 生成、意图处理、连接测试和聊天最终都经过该工厂。模块在主进程 ESM 初始化阶段用 top-level await 读取一次设置和 `~/.nova/openAuth2.json`；持久化开关变化由 settings IPC 同步到内存，未保存的连接测试用 `AsyncLocalStorage<boolean>` 提供请求级覆盖，避免竞态且不把 token 传给 renderer。

**Tech Stack:** TypeScript · Electron · React 18 · Ant Design · Zustand · Vitest · Bun · esbuild ESM (Node 20)

**Specification:** `docs/superpowers/specs/2026-07-17-open-platform-login-design.md`

## Global Constraints

- 开放平台 Base URL 必须固定为 `https://zn-nova.paic.com.cn/novai`。
- API Key 只能来自 Electron 启动时读取的 `~/.nova/openAuth2.json` 的非空字符串 `access_token`。
- token 只保存在主进程内存；不得进入 `settings.json`、renderer、IPC 返回值、日志或错误文本。
- 凭据文件只在启动初始化时读取；运行期间不监听、不重读、不自动重试。
- 开放平台凭据异常时应用仍可启动，但开放平台调用必须明确报错且绝不回退手动配置。
- 开关关闭时现有手动 Base URL/API Key 行为不变；切换不能覆盖手动值。
- 所有 LLM 调用必须通过现有 `createModelCaller()` 边界，禁止在 PPT、聊天、意图或连接测试路径分别复制认证判断。
- 不新增 npm/Bun 依赖。
- 主进程改动限制为 3 个现有文件：`src/main/fs/settings.ts`、`src/main/sdk/zai-bridge.ts`、`src/main/ipc/settings.ts`。
- 因修改 `src/main/**`，最终必须执行 `bun run build:main` 并在获得用户确认后完全重启 Electron。
- 任何 commit 步骤只有在用户明确授权创建提交后才能执行；未授权时跳过 commit，不得 amend 或跳过 hooks。

## File Structure

### Create

- `tests/unit/main/sdk/zai-bridge-auth.test.ts` — 启动凭据加载、缓存、错误脱敏、全局模式和请求级模式覆盖。
- `tests/unit/main/ipc/settings.test.ts` — settings IPC 对开关状态和未保存连接测试配置的传递。
- `tests/unit/renderer/settings-view.test.tsx` — LLM 设置在手动/开放平台两种状态下的服务端静态渲染断言。

### Modify

- `src/shared/types.ts:39-54` — 增加开关字段和非敏感共享常量。
- `src/main/fs/settings.ts:12-34` — 默认值及旧版嵌套 LLM 配置归一化。
- `tests/unit/main/fs/settings.test.ts:23-42` — 默认值和旧设置迁移回归测试。
- `src/main/sdk/zai-bridge.ts:9-20,95-126` — 启动认证缓存、模式上下文、有效凭据解析及 ModelCaller 延迟建 client。
- `src/main/ipc/settings.ts:1-16` — 保存时同步模式；连接测试接收当前表单并使用请求级覆盖。
- `src/preload/index.ts:1-25` — `testConnection(settings)` 参数桥接。
- `src/renderer/lib/api.ts:50-54` — renderer bridge 类型同步。
- `src/renderer/workbench/SettingsView.tsx:1-144` — 开关、禁用/显示规则及当前表单连接测试。
- `tests/unit/main/ipc/chat.test.ts:44-53` — 为强类型 Settings fixture 补充默认关闭字段。

---

### Task 1: 设置模型、默认值和旧配置归一化

**Files:**
- Modify: `src/shared/types.ts:39-54`
- Modify: `src/main/fs/settings.ts:12-34`
- Test: `tests/unit/main/fs/settings.test.ts:23-42`

**Interfaces:**
- Produces: `LLMSettings.useOpenPlatform: boolean`
- Produces: `OPEN_PLATFORM_BASE_URL = "https://zn-nova.paic.com.cn/novai"`
- Produces: `OPEN_PLATFORM_CREDENTIAL_PATH = "~/.nova/openAuth2.json"`
- Guarantees: `getSettings()` always returns a complete nested `llm` object, including `useOpenPlatform: false` for old files.

- [ ] **Step 1: Add failing tests for the default and old nested settings**

Extend the first `describe("fs/settings", ...)` block in `tests/unit/main/fs/settings.test.ts`:

```ts
it("defaults open platform login to disabled", async () => {
  const s = await getSettings();
  expect(s.llm.useOpenPlatform).toBe(false);
});

it("fills the open platform flag into a legacy llm object", async () => {
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({
      llm: {
        provider: "custom",
        baseUrl: "https://legacy.example.com",
        apiKey: "legacy-key",
        model: "legacy-model",
      },
      ui: { theme: "dark" },
      paths: { projectsDir: "/tmp/legacy-projects" },
    }),
  );

  const s = await getSettings();

  expect(s.llm).toEqual({
    provider: "custom",
    baseUrl: "https://legacy.example.com",
    apiKey: "legacy-key",
    model: "legacy-model",
    useOpenPlatform: false,
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bunx vitest run tests/unit/main/fs/settings.test.ts
```

Expected: the new assertions fail because `useOpenPlatform` is currently absent, and the legacy nested `llm` object replaces the default nested object.

- [ ] **Step 3: Add the shared field and constants**

Update the LLM section in `src/shared/types.ts`:

```ts
export type LLMProvider = "anthropic" | "openai" | "custom";

export const OPEN_PLATFORM_BASE_URL = "https://zn-nova.paic.com.cn/novai";
export const OPEN_PLATFORM_CREDENTIAL_PATH = "~/.nova/openAuth2.json";

export interface LLMSettings {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  useOpenPlatform: boolean;
}
```

- [ ] **Step 4: Normalize nested settings without changing corrupt-file fallback**

In `src/main/fs/settings.ts`, add the default field:

```ts
llm: {
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  model: "claude-3-5-sonnet-20241022",
  useOpenPlatform: false,
},
```

Replace the successful parse branch in `getSettings()` with a nested merge:

```ts
const raw = await readFile(p, "utf8");
const parsed = JSON.parse(raw) as Partial<Settings>;
const defaults = defaultSettings();
if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
return {
  ...defaults,
  ...parsed,
  llm: { ...defaults.llm, ...(parsed.llm ?? {}) },
  ui: { ...defaults.ui, ...(parsed.ui ?? {}) },
  paths: { ...defaults.paths, ...(parsed.paths ?? {}) },
};
```

Keep the existing `catch { return defaultSettings(); }` behavior.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
bunx vitest run tests/unit/main/fs/settings.test.ts
```

Expected: all `fs/settings` and prompt override tests pass.

- [ ] **Step 6: Commit only if explicitly authorized**

```bash
git add src/shared/types.ts src/main/fs/settings.ts tests/unit/main/fs/settings.test.ts
git commit -m "feat(settings): add open platform login flag"
```

Otherwise leave the changes uncommitted and continue.

---

### Task 2: 启动凭据缓存与统一 ModelCaller 认证边界

**Files:**
- Modify: `src/main/sdk/zai-bridge.ts:9-20,95-126`
- Create: `tests/unit/main/sdk/zai-bridge-auth.test.ts`

**Interfaces:**
- Consumes: `LLMSettings.useOpenPlatform` and the shared URL/path constants from Task 1.
- Produces: `initializeOpenPlatformAuth(enabled: boolean, filePath?: string): Promise<void>`
- Produces: `setOpenPlatformEnabled(enabled: boolean): void`
- Produces: `withOpenPlatformMode<T>(enabled: boolean, run: () => Promise<T>): Promise<T>`
- Produces: `resolveLlmCredentials(manual: ModelCallerOpts): ModelCallerOpts`
- Behavior: module initialization reads stored settings and credential once before main module evaluation continues; only a confirmed Vitest runtime (`NODE_ENV=test` and `VITEST=true`) skips the automatic home-directory read and initializes explicitly in tests.

**Approved Task 2 review amendment (2026-07-17):** A `ModelCaller` must resolve credentials and construct its Anthropic client for every generator invocation; it must not cache one client across invocations, because the same caller can execute under different async-local mode overrides. Tests must exercise the returned model caller—not only `resolveLlmCredentials()`—for lazy resolution, manual/open reuse, concurrent opposite modes, runtime-path credential errors, and unchanged `req.model`. Error tests must assert that custom paths and system error details are absent, and at least one test must compare the fixed Base URL to the literal `https://zn-nova.paic.com.cn/novai`.

- [ ] **Step 1: Write failing credential and mode tests**

Create `tests/unit/main/sdk/zai-bridge-auth.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initializeOpenPlatformAuth,
  resolveLlmCredentials,
  setOpenPlatformEnabled,
  withOpenPlatformMode,
} from "../../../../src/main/sdk/zai-bridge.js";
import { OPEN_PLATFORM_BASE_URL } from "../../../../src/shared/types.js";

const manual = { baseUrl: "https://manual.example.com", apiKey: "manual-key" };

describe("open platform authentication", () => {
  let dir: string;
  let credentialPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "znap-open-auth-"));
    credentialPath = join(dir, "openAuth2.json");
    await initializeOpenPlatformAuth(false, join(dir, "missing.json"));
  });

  afterEach(async () => {
    setOpenPlatformEnabled(false);
    await rm(dir, { recursive: true, force: true });
  });

  it("uses manual credentials when the switch is disabled", () => {
    expect(resolveLlmCredentials(manual)).toEqual(manual);
  });

  it("uses the fixed URL and trimmed startup token when enabled", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "  token-a  " }));
    await initializeOpenPlatformAuth(true, credentialPath);

    expect(resolveLlmCredentials(manual)).toEqual({
      baseUrl: OPEN_PLATFORM_BASE_URL,
      apiKey: "token-a",
    });
  });

  it("keeps the cached token until startup initialization runs again", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "token-a" }));
    await initializeOpenPlatformAuth(true, credentialPath);
    await writeFile(credentialPath, JSON.stringify({ access_token: "token-b" }));

    expect(resolveLlmCredentials(manual).apiKey).toBe("token-a");

    await initializeOpenPlatformAuth(true, credentialPath);
    expect(resolveLlmCredentials(manual).apiKey).toBe("token-b");
  });

  it.each([
    ["missing file", null, "凭据文件不存在"],
    ["invalid json", "{secret-token", "凭据文件不是有效 JSON"],
    ["null root", "null", "凭据字段缺失或无效"],
    ["missing field", "{}", "凭据字段缺失或无效"],
    ["non-string field", '{"access_token":123}', "凭据字段缺失或无效"],
    ["blank field", '{"access_token":"   "}', "凭据字段缺失或无效"],
  ])("reports a safe error for %s", async (_name, content, reason) => {
    if (content !== null) await writeFile(credentialPath, content);
    await initializeOpenPlatformAuth(true, credentialPath);

    let message = "";
    try {
      resolveLlmCredentials(manual);
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain(reason);
    expect(message).toContain("~/.nova/openAuth2.json");
    expect(message).toContain("完全重启应用");
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("manual-key");
  });

  it("normalizes non-ENOENT read failures without exposing system details", async () => {
    await mkdir(credentialPath);
    await initializeOpenPlatformAuth(true, credentialPath);
    expect(() => resolveLlmCredentials(manual)).toThrow("无法读取凭据文件");
  });

  it("uses an async-local override without changing the persisted runtime mode", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(false, credentialPath);

    const tested = await withOpenPlatformMode(true, async () =>
      resolveLlmCredentials(manual),
    );

    expect(tested).toEqual({
      baseUrl: OPEN_PLATFORM_BASE_URL,
      apiKey: "open-token",
    });
    expect(resolveLlmCredentials(manual)).toEqual(manual);
  });

  it("allows a manual request override while the persisted mode is enabled", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(true, credentialPath);

    const tested = await withOpenPlatformMode(false, async () =>
      resolveLlmCredentials(manual),
    );

    expect(tested).toEqual(manual);
    expect(resolveLlmCredentials(manual).apiKey).toBe("open-token");
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-auth.test.ts
```

Expected: test module fails to import because the four new exports do not exist.

- [ ] **Step 3: Implement startup state and safe credential loading**

At the top of `src/main/sdk/zai-bridge.ts`, add imports:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  OPEN_PLATFORM_BASE_URL,
  OPEN_PLATFORM_CREDENTIAL_PATH,
} from "../../shared/types.js";
import * as settingsFs from "../fs/settings.js";
```

Add the authentication state before the Anthropic SDK plumbing section:

```ts
type OpenPlatformAuthState =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

let openPlatformEnabled = false;
let openPlatformAuth: OpenPlatformAuthState = {
  ok: false,
  reason: "凭据尚未初始化",
};
const openPlatformMode = new AsyncLocalStorage<boolean>();

export async function initializeOpenPlatformAuth(
  enabled: boolean,
  filePath = join(homedir(), ".nova", "openAuth2.json"),
): Promise<void> {
  openPlatformEnabled = enabled;

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    openPlatformAuth = {
      ok: false,
      reason: code === "ENOENT" ? "凭据文件不存在" : "无法读取凭据文件",
    };
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    openPlatformAuth = { ok: false, reason: "凭据文件不是有效 JSON" };
    return;
  }

  const token =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { access_token?: unknown }).access_token
      : undefined;
  if (typeof token !== "string" || !token.trim()) {
    openPlatformAuth = { ok: false, reason: "凭据字段缺失或无效" };
    return;
  }

  openPlatformAuth = { ok: true, accessToken: token.trim() };
}

export function setOpenPlatformEnabled(enabled: boolean): void {
  openPlatformEnabled = enabled;
}

export function withOpenPlatformMode<T>(
  enabled: boolean,
  run: () => Promise<T>,
): Promise<T> {
  return openPlatformMode.run(enabled, run);
}
```

Add startup initialization immediately after these declarations:

```ts
const isVitest = process.env.NODE_ENV === "test" && process.env.VITEST === "true";
if (!isVitest) {
  const settings = await settingsFs.getSettings();
  await initializeOpenPlatformAuth(settings.llm.useOpenPlatform);
}
```

Because the main bundle is ESM targeting Node 20, this top-level await completes during module evaluation before `src/main/index.ts` can register IPC handlers. Vitest sets both `NODE_ENV=test` and `VITEST=true`; requiring both values prevents an unrelated inherited `VITEST` variable from disabling production startup initialization.

- [ ] **Step 4: Resolve credentials centrally and lazily inside ModelCaller**

```ts
export type ModelCallerOpts = {
  baseUrl: string;
  apiKey: string;
};

export function resolveLlmCredentials(manual: ModelCallerOpts): ModelCallerOpts {
  const enabled = openPlatformMode.getStore() ?? openPlatformEnabled;
  if (!enabled) return manual;
  if (!openPlatformAuth.ok) {
    throw new Error(
      `开放平台登录凭据不可用：${openPlatformAuth.reason}。请检查 ${OPEN_PLATFORM_CREDENTIAL_PATH} 后完全重启应用。`,
    );
  }
  return {
    baseUrl: OPEN_PLATFORM_BASE_URL,
    apiKey: openPlatformAuth.accessToken,
  };
}
```

Move client construction from the outer `createModelCaller()` body into each returned async-generator invocation:

```ts
export function createModelCaller(opts: ModelCallerOpts) {
  return async function* modelCaller(req: {
    model: string;
    systemPrompt: string | Array<{ type: string; [k: string]: unknown }> | undefined;
    messages: Array<{ role: "user" | "assistant"; content: unknown }>;
    tools: Array<{ name: string; [k: string]: unknown }>;
    signal: AbortSignal;
  }): AsyncGenerator<any, any, any> {
    const client = makeAnthropicClient(resolveLlmCredentials(opts));
```

Leave the existing request model (`req.model`), system prompt, tools, stream, abort, and yield logic unchanged. Open-platform mode replaces only Base URL and API key, so neither `runZaiQuery()` nor production chat needs a call-site change. Per-invocation construction is required so every generator execution resolves the current `AsyncLocalStorage` override independently, including concurrent calls under opposite modes, and so credential errors occur inside existing runtime error paths.

- [ ] **Step 5: Run bridge tests and the existing runner tests**

Run:

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-auth.test.ts tests/unit/main/sdk/runner.test.ts
```

Expected: all tests pass; no test output contains token values.

- [ ] **Step 6: Commit only if explicitly authorized**

```bash
git add src/main/sdk/zai-bridge.ts tests/unit/main/sdk/zai-bridge-auth.test.ts
git commit -m "feat(llm): resolve open platform credentials centrally"
```

Otherwise leave the changes uncommitted and continue.

---

### Task 3: Settings IPC 与未保存连接测试模式

**Files:**
- Modify: `src/main/ipc/settings.ts:1-16`
- Modify: `src/preload/index.ts:1-25`
- Modify: `src/renderer/lib/api.ts:50-54`
- Modify: `src/renderer/workbench/SettingsView.tsx:102-105`
- Create: `tests/unit/main/ipc/settings.test.ts`

**Interfaces:**
- Consumes: `setOpenPlatformEnabled()` and `withOpenPlatformMode()` from Task 2.
- Changes: `window.api.settings.testConnection(settings: Settings)` now tests the current form rather than rereading persisted settings.
- Guarantees: saving changes the process-wide mode only after settings persistence succeeds; a connection test override is scoped to that async request.

- [ ] **Step 1: Write failing IPC tests**

Create `tests/unit/main/ipc/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../../../src/shared/types.js";
import { IPC } from "../../../../src/shared/ipc-channels.js";

const handlers = new Map<string, Function>();
const fsMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getPromptOverride: vi.fn(),
  setPromptOverride: vi.fn(),
  resetPromptOverride: vi.fn(),
  listPromptOverrides: vi.fn(),
}));
const connectionMock = vi.hoisted(() => vi.fn());
const setOpenPlatformEnabledMock = vi.hoisted(() => vi.fn());
const withOpenPlatformModeMock = vi.hoisted(() =>
  vi.fn(async (_enabled: boolean, run: () => Promise<unknown>) => run()),
);

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
  ipcMain: { handle: (channel: string, handler: Function) => handlers.set(channel, handler) },
}));
vi.mock("../../../../src/main/fs/settings.js", () => fsMocks);
vi.mock("../../../../src/main/sdk/connection.js", () => ({
  testLLMConnection: connectionMock,
}));
vi.mock("../../../../src/main/sdk/zai-bridge.js", () => ({
  setOpenPlatformEnabled: setOpenPlatformEnabledMock,
  withOpenPlatformMode: withOpenPlatformModeMock,
}));

import { registerSettingsIPC } from "../../../../src/main/ipc/settings.js";

const candidate: Settings = {
  llm: {
    provider: "custom",
    baseUrl: "https://manual.example.com",
    apiKey: "manual-key",
    model: "model-a",
    useOpenPlatform: true,
  },
  ui: { theme: "light" },
  paths: { projectsDir: "/tmp/projects" },
};

describe("settings IPC", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    fsMocks.setSettings.mockResolvedValue(undefined);
    connectionMock.mockResolvedValue({ ok: true });
    registerSettingsIPC();
  });

  it("updates the process mode only after persisting settings", async () => {
    const handler = handlers.get(IPC.SETTINGS_SET);
    expect(handler).toBeDefined();

    await handler?.({}, { settings: candidate });

    expect(fsMocks.setSettings).toHaveBeenCalledWith(candidate);
    expect(setOpenPlatformEnabledMock).toHaveBeenCalledWith(true);
    expect(fsMocks.setSettings.mock.invocationCallOrder[0]).toBeLessThan(
      setOpenPlatformEnabledMock.mock.invocationCallOrder[0],
    );
  });

  it("tests the current form in an isolated open platform mode", async () => {
    const handler = handlers.get(IPC.SETTINGS_TEST_CONNECTION);
    expect(handler).toBeDefined();

    await handler?.({}, { settings: candidate });

    expect(withOpenPlatformModeMock).toHaveBeenCalledWith(true, expect.any(Function));
    expect(connectionMock).toHaveBeenCalledWith(candidate);
    expect(fsMocks.getSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bunx vitest run tests/unit/main/ipc/settings.test.ts
```

Expected: assertions fail because the existing handler rereads persisted settings and never synchronizes or scopes the mode.

- [ ] **Step 3: Update the main-process settings handlers**

In `src/main/ipc/settings.ts`, import `Settings` and the two bridge functions:

```ts
import type { Settings } from "../../shared/types.js";
import {
  setOpenPlatformEnabled,
  withOpenPlatformMode,
} from "../sdk/zai-bridge.js";
```

Replace the three core settings handlers with:

```ts
ipcMain.handle(IPC.SETTINGS_GET, () => fs.getSettings());
ipcMain.handle(
  IPC.SETTINGS_SET,
  async (_, { settings }: { settings: Settings }) => {
    await fs.setSettings(settings);
    setOpenPlatformEnabled(settings.llm.useOpenPlatform);
  },
);
ipcMain.handle(
  IPC.SETTINGS_TEST_CONNECTION,
  async (_, { settings }: { settings: Settings }) =>
    withOpenPlatformMode(settings.llm.useOpenPlatform, () =>
      testLLMConnection(settings),
    ),
);
```

Leave prompt and system path handlers unchanged.

- [ ] **Step 4: Type the preload and renderer bridge argument**

In `src/preload/index.ts`, add `Settings` to the shared type import and change:

```ts
testConnection: (settings: Settings) =>
  ipcRenderer.invoke(IPC.SETTINGS_TEST_CONNECTION, { settings }),
```

In `src/renderer/lib/api.ts`, change the bridge signature to:

```ts
testConnection(settings: Settings): Promise<{
  ok: boolean;
  models?: string[];
  error?: string;
}>;
```

In `src/renderer/workbench/SettingsView.tsx`, immediately update the existing call site so this task remains type-correct:

```ts
const r = await window.api.settings.testConnection(form);
```

- [ ] **Step 5: Run focused tests and main/renderer typechecking**

Run:

```bash
bunx vitest run tests/unit/main/ipc/settings.test.ts tests/unit/main/sdk/zai-bridge-auth.test.ts && bun run typecheck
```

Expected: focused tests and both TypeScript configurations pass with zero errors.

- [ ] **Step 6: Commit only if explicitly authorized**

```bash
git add src/main/ipc/settings.ts src/preload/index.ts src/renderer/lib/api.ts src/renderer/workbench/SettingsView.tsx tests/unit/main/ipc/settings.test.ts
git commit -m "feat(settings): test unsaved open platform configuration"
```

Otherwise leave the changes uncommitted and continue.

---

### Task 4: LLM 设置界面开关与字段保护

**Files:**
- Modify: `src/renderer/workbench/SettingsView.tsx:1-144`
- Create: `tests/unit/renderer/settings-view.test.tsx`

**Interfaces:**
- Consumes: `OPEN_PLATFORM_BASE_URL`, `OPEN_PLATFORM_CREDENTIAL_PATH`, and `LLMSettings.useOpenPlatform` from Task 1.
- Consumes: `window.api.settings.testConnection(form)` from Task 3.
- UI guarantees: manual values remain in form state; open mode renders only fixed URL and credential source, never the token or saved manual key.

- [ ] **Step 1: Write failing static-render UI tests without adding DOM dependencies**

Create `tests/unit/renderer/settings-view.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../../src/shared/types.js";
import { OPEN_PLATFORM_BASE_URL } from "../../../src/shared/types.js";

const store = vi.hoisted(() => ({
  settings: null as Settings | null,
  loaded: true,
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../../src/renderer/stores/settings.js", () => ({
  useSettingsStore: () => store,
}));
vi.mock("../../../src/renderer/components/PromptSettings.js", () => ({
  PromptSettings: () => null,
}));

import { SettingsView } from "../../../src/renderer/workbench/SettingsView.js";

function settings(useOpenPlatform: boolean): Settings {
  return {
    llm: {
      provider: "custom",
      baseUrl: "https://manual.example.com",
      apiKey: "manual-key",
      model: "model-a",
      useOpenPlatform,
    },
    ui: { theme: "light" },
    paths: { projectsDir: "/tmp/projects" },
  };
}

function control(markup: string, label: string): string {
  const match = markup.match(new RegExp(`<[^>]+aria-label="${label}"[^>]*>`));
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

describe("SettingsView LLM authentication mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps manual fields editable when open platform login is disabled", () => {
    store.settings = settings(false);
    const markup = renderToStaticMarkup(<SettingsView />);

    expect(control(markup, "API Base URL")).toContain('value="https://manual.example.com"');
    expect(control(markup, "API Base URL")).not.toContain("disabled");
    expect(control(markup, "API Key")).toContain('value="manual-key"');
    expect(control(markup, "API Key")).not.toContain("disabled");
  });

  it("shows fixed connection information without exposing manual or open tokens", () => {
    store.settings = settings(true);
    const markup = renderToStaticMarkup(<SettingsView />);

    expect(control(markup, "使用开放平台登录")).toContain('aria-checked="true"');
    expect(control(markup, "API Base URL")).toContain(`value="${OPEN_PLATFORM_BASE_URL}"`);
    expect(control(markup, "API Base URL")).toContain("disabled");
    expect(control(markup, "API Key")).toContain("disabled");
    expect(markup).toContain("读取自 ~/.nova/openAuth2.json");
    expect(markup).not.toContain("manual-key");
  });
});
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run:

```bash
bunx vitest run tests/unit/renderer/settings-view.test.tsx
```

Expected: assertions fail because the switch and conditional disabled/display behavior do not exist.

- [ ] **Step 3: Add the switch and conditional field rendering**

Update imports in `src/renderer/workbench/SettingsView.tsx`:

```ts
import { App as AntdApp, Button, Form, Input, Select, Switch } from "antd";
import {
  OPEN_PLATFORM_BASE_URL,
  OPEN_PLATFORM_CREDENTIAL_PATH,
} from "../../shared/types.js";
```

Add this form item after the provider selector:

```tsx
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
```

Replace Base URL with:

```tsx
<Form.Item label="API Base URL">
  <Input
    aria-label="API Base URL"
    value={form.llm.useOpenPlatform ? OPEN_PLATFORM_BASE_URL : form.llm.baseUrl}
    disabled={form.llm.useOpenPlatform}
    onChange={(e) => update({ baseUrl: e.target.value })}
    style={{ fontFamily: "monospace" }}
  />
</Form.Item>
```

Replace API Key with:

```tsx
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
    placeholder={form.llm.useOpenPlatform ? `读取自 ${OPEN_PLATFORM_CREDENTIAL_PATH}` : undefined}
    disabled={form.llm.useOpenPlatform}
    onChange={(e) => update({ apiKey: e.target.value })}
    style={{ fontFamily: "monospace" }}
  />
</Form.Item>
```

Do not mutate `form.llm.baseUrl` or `form.llm.apiKey` when the switch changes; conditional rendering alone preserves and restores the manual values. The current-form connection-test call was already updated in Task 3.

- [ ] **Step 4: Run renderer tests and full typechecking**

Run:

```bash
bunx vitest run tests/unit/renderer/settings-view.test.tsx tests/unit/main/ipc/settings.test.ts && bun run typecheck
```

Expected: renderer and IPC tests pass, and both TypeScript configurations report zero errors.

- [ ] **Step 5: Commit only if explicitly authorized**

```bash
git add src/renderer/workbench/SettingsView.tsx tests/unit/renderer/settings-view.test.tsx
git commit -m "feat(settings): add open platform login switch"
```

Otherwise leave the changes uncommitted and continue.

---

### Task 5: 调用链回归、完整验证与主进程重建

**Files:**
- Modify: `tests/unit/main/ipc/chat.test.ts:44-53`
- Verify only: `src/main/sdk/runner.ts`
- Verify only: `src/main/sdk/connection.ts`
- Verify only: `src/main/ipc/chat.ts`
- Verify only: `src/main/sdk/zai-bridge.ts`

**Interfaces:**
- Confirms: `GenerationRunner` and connection testing reach `runZaiQuery()`, which calls `createModelCaller()`.
- Confirms: production chat directly calls the same `createModelCaller()`.
- Confirms: no application LLM path constructs `Anthropic` outside `zai-bridge.ts`.

- [ ] **Step 1: Update the typed chat Settings fixture**

In `tests/unit/main/ipc/chat.test.ts`, add the default-off field:

```ts
llm: {
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "test-key",
  model: "claude-test",
  useOpenPlatform: false,
},
```

Do not add open-platform token data to any renderer or chat fixture.

- [ ] **Step 2: Verify active application LLM calls remain centralized**

Use the Grep tool for both of these searches:

1. Active call paths:
   - Pattern: `createModelCaller|runZaiQuery`
   - Paths: `src/main/ipc`, `src/main/sdk/runner.ts`, `src/main/sdk/connection.ts`, `src/main/sdk/zai-bridge.ts`
   - Glob: `*.ts`
   - Output: content with line numbers
2. Anthropic constructors:
   - Pattern: `new Anthropic|AnthropicCtor|makeAnthropicClient`
   - Path: `src/main`
   - Glob: `*.ts`
   - Output: content with line numbers

Expected findings:

- `GenerationRunner` and `testLLMConnection` call `runZaiQuery()`, which calls `createModelCaller()` in `src/main/sdk/zai-bridge.ts`.
- Production chat calls `createModelCaller()` directly.
- The active application bridge constructs its Anthropic client only in `src/main/sdk/zai-bridge.ts`.
- A separate constructor exists in vendored internal source at `src/main/sdk/zai-agent-core/opencc-internals/services/api/client.ts`; this is expected and is not an active application credential path unless an application file imports or invokes it.
- No active application-level LLM call path bypasses `createModelCaller()`.

If an application file outside the vendored internal subtree imports or invokes a different client constructor, stop and update this plan before editing it; do not duplicate resolver logic.

- [ ] **Step 3: Run all focused feature tests**

Run:

```bash
bunx vitest run \
  tests/unit/main/fs/settings.test.ts \
  tests/unit/main/sdk/zai-bridge-auth.test.ts \
  tests/unit/main/ipc/settings.test.ts \
  tests/unit/main/ipc/chat.test.ts \
  tests/unit/main/sdk/runner.test.ts \
  tests/unit/renderer/settings-view.test.tsx
```

Expected: all listed test files pass with zero failures.

- [ ] **Step 4: Run repository-wide static and test verification**

Run each command independently and require exit code 0:

```bash
bun run typecheck
bun run test
git diff --check
```

Expected:

- Both main and renderer TypeScript checks pass.
- Full Vitest suite reports zero failed files and zero failed tests.
- `git diff --check` prints no whitespace errors.

- [ ] **Step 5: Build both main and renderer bundles**

Run:

```bash
bun run build
```

Expected:

- Main ESM and preload CJS bundles build successfully.
- Renderer Vite build succeeds.
- The existing chunk-size warning is allowed; errors are not.

This build is mandatory because `src/main/**`, preload, and renderer files all changed.

- [ ] **Step 6: Review the final diff for secret and scope safety**

Run:

```bash
git status --short
git diff -- src/shared/types.ts src/main/fs/settings.ts src/main/sdk/zai-bridge.ts src/main/ipc/settings.ts src/preload/index.ts src/renderer/lib/api.ts src/renderer/workbench/SettingsView.tsx tests/unit/main/fs/settings.test.ts tests/unit/main/sdk/zai-bridge-auth.test.ts tests/unit/main/ipc/settings.test.ts tests/unit/main/ipc/chat.test.ts tests/unit/renderer/settings-view.test.tsx
```

Verify manually:

- No literal real token appears.
- No token is added to `Settings`, preload return values, renderer state, or logs.
- The only persisted new value is `useOpenPlatform`.
- Main changes are limited to the three allowed files.
- Existing unrelated working-tree changes are untouched.

- [ ] **Step 7: Completely restart Electron after user confirmation**

Before terminating any existing app process, ask for confirmation because it affects the user's running development session. After approval:

```bash
bun run dev
```

Verify without printing credentials:

1. 开关关闭：手动 Base URL/API Key 可编辑，原值保持。
2. 开关开启：Base URL 固定且禁用；API Key 禁用，仅显示文件来源。
3. 保存并重新打开设置：开关状态保持。
4. 凭据缺失或无效：连接测试返回中文可操作错误且应用不退出。
5. 凭据有效：只有在用户允许实际外部请求时才点击连接测试；不得输出 token。
6. 修改 `openAuth2.json` 后不重启：当前进程继续使用启动缓存；完全重启后才加载新值。自动化测试已覆盖此生命周期，手工验证无需展示两个 token。

- [ ] **Step 8: Request independent verification**

Because this implementation changes shared types, main-process authentication behavior, preload IPC, and renderer UI, invoke an independent `verification` agent with:

- Original user request.
- Approved spec path.
- This implementation plan path.
- Complete changed-file list.
- No claimed test results; let the verifier run its own commands.

On FAIL, fix and resume the same verifier. On PASS, rerun 2–3 commands from its report and compare output before reporting completion.

- [ ] **Step 9: Commit only if explicitly authorized**

If the user requests a final commit and earlier task commits were skipped:

```bash
git add src/shared/types.ts src/main/fs/settings.ts src/main/sdk/zai-bridge.ts src/main/ipc/settings.ts src/preload/index.ts src/renderer/lib/api.ts src/renderer/workbench/SettingsView.tsx tests/unit/main/fs/settings.test.ts tests/unit/main/sdk/zai-bridge-auth.test.ts tests/unit/main/ipc/settings.test.ts tests/unit/main/ipc/chat.test.ts tests/unit/renderer/settings-view.test.tsx docs/superpowers/specs/2026-07-17-open-platform-login-design.md docs/superpowers/plans/2026-07-17-open-platform-login.md
git commit -m "feat(llm): add open platform login mode"
```

Do not include unrelated lockfile, workspace, `.npmrc`, or other pre-existing working-tree changes. If commit authorization is absent, do not commit.
