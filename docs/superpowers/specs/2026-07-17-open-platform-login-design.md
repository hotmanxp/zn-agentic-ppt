# 开放平台登录切换设计

**日期：** 2026-07-17  
**状态：** 已确认

## 背景

当前 LLM 配置持久化 `provider`、`baseUrl`、`apiKey` 和 `model`，renderer 通过 settings IPC 读写配置，主进程在连接测试及 LLM 请求中使用其中的 Base URL、API Key 和模型。

需要在 LLM 配置中增加“使用开放平台登录”开关。开启后，所有 LLM 调用必须使用固定 Base URL：

```text
https://zn-nova.paic.com.cn/novai
```

API Key 来自应用启动时读取的 `~/.nova/openAuth2.json` 文件中的 `access_token` 字段。

## 目标

1. 在 LLM 设置区增加可持久化的“使用开放平台登录”开关。
2. 开启后，PPT 生成、聊天、意图处理、连接测试等所有 LLM 调用统一使用开放平台连接信息。
3. 开放平台 token 仅保存在主进程内存中，不写入应用配置，不发送给 renderer，不写入日志。
4. 保留用户原有手动 Base URL 和 API Key；关闭开关后恢复使用。
5. 对凭据文件异常提供明确、可操作的错误，不静默回退。

## 非目标

- 不实现开放平台登录流程或 token 刷新流程。
- 不监听 `~/.nova/openAuth2.json` 的运行时变化。
- 不把开放平台新增为 provider 下拉选项。
- 不改变现有模型选择行为。
- 不迁移或删除用户已有的手动 LLM 配置。

## 配置模型

在共享的 `LLMSettings` 中增加：

```ts
useOpenPlatform: boolean
```

默认值为 `false`。旧版 `settings.json` 缺少该字段时按 `false` 处理，保持原行为。

该字段是唯一需要新增持久化的数据。开放平台固定 Base URL 和 token 均不写入 `settings.json`。

## 主进程凭据生命周期

主进程在每次 Electron 应用启动时，无论当前开关状态如何，都尝试读取一次。初始化必须在注册或开放任何可发起 LLM 请求的 IPC/服务之前完成：

```text
~/.nova/openAuth2.json
```

读取结果缓存在主进程内存中，状态为以下两类之一：

- 成功：缓存经过校验的非空 `access_token`。
- 失败：缓存安全的错误原因，例如文件缺失、无法读取、JSON 无效、字段缺失或字段为空。

运行期间不重新读取、不监听文件变化、不自动重试。用户修复或更新凭据文件后必须完全重启 Electron 才能生效。

读取失败不会阻止应用启动。只有在开放平台模式被用于连接测试或 LLM 请求时才返回错误。

## 有效 LLM 配置解析

在主进程建立单一的有效配置解析边界。所有 LLM 入口在创建客户端或发起请求前都必须使用该边界，不能在各调用路径中分别实现开关判断。

解析规则：

### 开关关闭

返回用户现有的手动配置：

- `baseUrl = settings.llm.baseUrl`
- `apiKey = settings.llm.apiKey`
- `model = settings.llm.model`

现有行为保持不变。

### 开关开启且启动凭据有效

返回：

- `baseUrl = "https://zn-nova.paic.com.cn/novai"`
- `apiKey = 启动时缓存的 access_token`
- `model = settings.llm.model`

### 开关开启但启动凭据无效

解析立即失败，返回清晰的中文错误，不使用手动 Base URL/API Key 作为回退。错误应：

- 指出 `~/.nova/openAuth2.json` 是凭据来源。
- 说明安全的失败原因。
- 提示用户修复文件后完全重启应用。
- 不包含 token、原始文件内容或其他敏感值。

建议错误格式：

```text
开放平台登录凭据不可用：<安全原因>。请检查 ~/.nova/openAuth2.json 后完全重启应用。
```

## 生效范围与数据流

开放平台模式对所有使用全局 LLM 配置的调用生效，包括：

- PPT 生成
- 聊天
- 意图处理
- LLM 连接测试
- 其他使用同一全局 LLM 配置的主进程调用

数据流如下：

```text
SettingsView 开关
  → settings store / IPC
  → ~/.zn-agentic-ppt/settings.json（仅保存 useOpenPlatform）
  → 主进程读取 LLMSettings
  → 有效配置解析器
      ├─ 手动模式：使用已保存 baseUrl/apiKey
      └─ 开放平台模式：使用固定 baseURL + 启动缓存 token
  → LLM 客户端 / 请求
```

开放平台 token 不通过 settings IPC，不进入 renderer 状态。

## 设置界面

在现有 LLM 配置区域增加开关：

```text
使用开放平台登录
```

### 开关关闭

- Base URL 和 API Key 输入框保持现有可编辑行为。
- 使用用户保存的手动值。

### 开关开启

- Base URL 输入框显示 `https://zn-nova.paic.com.cn/novai` 并禁用编辑。
- API Key 输入框禁用且不显示开放平台 token；输入区只显示凭据来源提示：`读取自 ~/.nova/openAuth2.json`。
- 模型字段继续可编辑。
- 用户原有手动 Base URL 和 API Key 值保留在表单状态和持久化配置中，但开放平台模式下不展示、不覆盖、不清空。

关闭开关后，界面恢复原手动值。

连接测试使用当前表单中的开关状态，因此用户可在保存前验证开放平台模式。凭据不可用时，连接测试显示主进程返回的安全错误。

## 安全要求

- 不把 `access_token` 写入 `settings.json` 或其他应用文件。
- 不通过 preload/IPC 将 token 暴露给 renderer。
- 不在错误、日志、测试快照或调试输出中包含 token。
- 不把原始凭据 JSON 内容附加到错误。
- 不因开放平台凭据异常而回退到用户手动 API Key，避免用户误判实际认证来源。

## 错误处理

凭据加载需要区分并归一化以下情况：

1. 文件不存在。
2. 文件无法读取，包括权限错误。
3. 文件不是有效 JSON。
4. 根值不是预期对象。
5. `access_token` 缺失、不是字符串或仅包含空白。

这些错误在内存中保存为不含敏感数据的状态。开放平台模式下，连接测试和所有 LLM 请求使用同一错误语义。

手动模式不受开放平台凭据状态影响；即使凭据文件无效，关闭开关时现有 LLM 行为仍保持不变。

## 测试策略

### 设置持久化

- 默认设置包含 `useOpenPlatform: false`。
- 旧配置缺少字段时读取为 `false`。
- 开关值可正确保存和重新读取。
- 保存开放平台模式不会把启动缓存 token 写入设置文件。

### 启动凭据加载

覆盖：

- 有效 JSON 和非空 `access_token`。
- 文件缺失。
- 读取失败。
- 非法 JSON。
- 非对象根值。
- 字段缺失。
- 非字符串字段。
- 空字符串或纯空白字段。

测试需要证明加载器只返回安全状态，不在错误文本中泄漏 token 或原始文件内容。

### 有效配置解析

- 开关关闭时返回手动配置，即使开放平台凭据无效也不报错。
- 开关开启且凭据有效时返回固定 Base URL 和缓存 token。
- 开关开启且凭据无效时明确失败。
- 失败时不回退到手动配置。
- 模型值在两种模式下均来自用户设置。

### 调用链

- 连接测试使用解析后的有效配置。
- PPT 生成、聊天、意图处理及其他 LLM 入口均经过统一解析边界。
- 运行期间修改凭据文件不会改变已缓存 token；重新初始化启动状态后才读取新值。

### Renderer UI

- 开关关闭时输入框可编辑且显示手动值。
- 开关开启时 Base URL 显示固定值并禁用。
- 开关开启时 API Key 禁用且只显示凭据来源。
- 切换过程中手动值不被覆盖，关闭后恢复。

## 验收标准

1. 关闭开关时，现有 LLM 配置和调用行为不变。
2. 开启开关后，所有 LLM 调用都使用固定 Base URL。
3. API Key 使用 Electron 启动时读取的 `access_token`。
4. 运行期间修改凭据文件不生效，完全重启后才生效。
5. 开放平台 token 不进入应用设置、renderer、IPC 返回值或日志。
6. 凭据异常不阻止应用启动，但开放平台连接测试和请求明确失败。
7. 凭据异常时绝不回退到手动配置。
8. 开启开关不会覆盖原有手动 Base URL/API Key，关闭后可继续使用。
9. `bun run typecheck` 和相关测试通过。
10. 因涉及 `src/main/**`，完成实现后执行 `bun run build:main` 并完全重启 Electron 验证。
