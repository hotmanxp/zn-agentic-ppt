# 对话框接入 LLM 与项目会话持久化设计

**日期**: 2026-07-16  
**目标**: 为现有 Workbench 对话框接入真实 LLM 流程；每个 PPT 项目保留完整会话；将 Skill 加载目录固定到 `~/.zn-agentic-ppt/skills`。

---

## 1. 背景与已确认需求

当前 Workbench 的 `Conversation` 主要由 renderer 根据 `phase` 拼装静态文案和流程卡片，`submitPrompt` 在部分阶段使用规则解析或直接启动 PPT 生成，`useWorkbenchSubscriptions` 仍是空实现。zai-agent-core 已具备 transcript、Skill loader、工具执行和续传能力，但现有 `runZaiQuery` 只服务 PPT 生成调用。

已确认的产品决策：

1. 每个 PPT 项目绑定一条长期会话；重新打开项目恢复全部历史。
2. 磁盘保留完整 transcript；界面展示用户/助手消息，并将 Skill、Read/Write/Edit、Glob/Grep 等过程折叠为工具卡片。
3. LLM 负责对话协调，现有“确认资料/确认大纲/开始生成”等关键按钮和 IPC 保留，不交给 LLM 自动调用。
4. 澄清阶段保留结构化表单；补充背景文本同时进入 LLM 对话，字段仍由用户确认，已有规则回填可继续使用。
5. LLM 可使用 Skill 及完整文件工具：Skill、Read、Write、Edit、Glob、Grep。
6. 同一项目的消息采用 FIFO 队列；应用退出后，未执行消息保留并在重新打开项目后继续。
7. LLM transcript、工具调用和流程卡片统一按时间顺序显示并持久化。
8. 只递归加载 `~/.zn-agentic-ppt/skills/**/SKILL.md`，不兼容旧的 `~/.zai/skills` 或其它目录。
9. 删除项目时同时删除 transcript、项目时间线和待执行队列。
10. 当前消息失败或被取消时暂停该项目队列，由用户决定重试、继续或移除。

---

## 2. 总体架构

### 2.1 两类持久化数据

**LLM transcript**：

```text
~/.zn-agentic-ppt/transcripts/ppt-<projectId>.json
```

使用固定 `transcriptId = ppt-<projectId>`。`TranscriptStore` 保存用户、助手、思考、Skill 注入、tool_use、tool_result 及 parent UUID 链，是 LLM 恢复上下文的唯一来源。

**项目会话时间线**：

```text
~/.zn-agentic-ppt/projects/<projectId>/conversation.json
```

保存 schema version、FIFO 队列和业务流程事件快照，不复制助手正文或工具结果。队列项在执行前暂存用户文本，执行后通过 `chat:<queueId>` 与 transcript 中对应用户消息关联；UI 读取时避免重复展示。

两类数据按 timestamp 合并为 renderer 使用的统一时间线：

- transcript 的普通 user/assistant 消息转成消息项；Skill 注入正文不显示；
- `tool_use` 与相应 `tool_result` 配成折叠工具卡片；
- `conversation.json` 中的工作流事件插入对应时间点；
- 尚未写入 transcript 的 queued 消息显示“排队中”。

### 2.2 Skills 路径

Electron 的 userData 已在 `src/main/index.ts:8-15` 固定为 `~/.zn-agentic-ppt`。ChatService 每轮查询都传入：

```ts
skillsDirs: [join(app.getPath("userData"), "skills")]
```

应用不读取 `~/.zai/skills`、仓库 skills 或项目内其它 skills。zai loader 本身每轮扫描目录，因此下一条消息即可使用新建或修改的 Skill；不存在目录时按空 Skill 集合运行，不阻断聊天。

### 2.3 主进程边界

新增 ChatService，集中负责：

- 会话加载与 transcript/时间线合并；
- 每项目一个 FIFO worker；
- model caller、cwd、skillsDirs 和工具配置；
- 流式事件转换和广播；
- 取消、失败暂停、重试和崩溃恢复；
- 原子写入 `conversation.json`。

renderer 不直接访问 transcript、skills 或 API Key。

---

## 3. 组件与接口

### 3.1 ChatService 生命周期

每个项目拥有一个运行状态：

```ts
type QueueStatus =
  | "queued"
  | "submitted"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
```

队列项至少包含：

```ts
type QueueItem = {
  id: string;
  text: string;
  status: QueueStatus;
  createdAt: number;
  updatedAt: number;
  transcriptUuid?: string;
  error?: { code: string; message: string; retryable: boolean };
};
```

执行流程：

1. `enqueue` 校验项目存在和文本非空，原子保存 queue item，立即返回 `queueId`。
2. worker 取队首；读取 transcript 尾部 UUID。
3. 通过 `appendUserMessageV2` 写入用户消息，并把 `userType` 设为 `chat:<queueId>`；成功后将队列项设为 `submitted`。
4. 调用 `DefaultAgentRuntime.run`，使用固定 transcript ID、项目目录 `cwd`、当前设置中的模型/API 配置、`skillsDirs` 和完整 `BRIDGE_TOOLS`。
5. 运行时将消息增量、工具开始/结束、完成或错误广播给 renderer。
6. 完成后以磁盘 transcript 为准标记 queue item；启动下一项。失败或取消则暂停 worker。

为避免已经落盘但队列状态未更新的崩溃窗口，启动或 `chat:load` 时按 `userType` 对账：若 transcript 已存在 `chat:<queueId>` 用户消息，则队列项进入 `submitted`，不再次追加用户消息。

运行时传入空 prompt 数组，让 queryEngine 只从已加载 transcript 继续，不重复追加同一用户输入。若应用在 assistant 完成前退出，重新打开项目后从该 transcript 继续；若已存在该轮最终 assistant 记录，则直接补记完成。

### 3.2 IPC 契约

新增共享 channel：

| Channel | 方向 | 用途 |
|---|---|---|
| `CHAT_LOAD` | renderer → main | 加载合并后的项目会话时间线 |
| `CHAT_SEND` | renderer → main | 入队一条用户消息 |
| `CHAT_CANCEL` | renderer → main | 取消当前轮并暂停队列 |
| `CHAT_RETRY` | renderer → main | 重试失败/取消项 |
| `CHAT_REMOVE_QUEUE_ITEM` | renderer → main | 移除未执行或失败项 |
| `CHAT_APPEND_WORKFLOW` | renderer → main | 写入白名单业务事件 |
| `CHAT_EVENT` | main → renderer | 推送流式 assistant、工具、队列和状态事件 |

所有请求和推送带 `projectId`。renderer 只处理当前项目的事件；项目切换不清空其它项目的后台 worker。

`CHAT_APPEND_WORKFLOW` 只接受代码定义的事件 union，不允许任意文件路径或任意 JSON 作为业务事件写入。

### 3.3 工作流事件

时间线只记录必要的历史快照，事件类型包括：

- `project-created`
- `brief-confirmed`：brief 和场景快照
- `sources-confirmed`：选中的资料 ID 和补充要求
- `outline-ready` / `outline-confirmed`：大纲快照
- `generation-started`
- `generation-completed` / `generation-failed` / `generation-cancelled`
- `revision-requested` / `revision-completed`

事件只在对应 IPC 成功后写入，因此失败操作不会显示为成功卡片。历史快照保持当时内容，不随项目后续编辑变化。

---

## 4. UI 与现有 Workbench 的接入

### 4.1 Chat store

新增独立 Zustand chat store，至少管理：

- 当前 `projectId`；
- 已合并的 timeline items；
- 当前 assistant 流文本；
- tool card 的运行状态和结果；
- queue items、当前运行项、暂停原因；
- 加载、发送、重试、移除和取消 action。

`workbench.ts` 继续管理 `phase`、brief、outline、PPT 生成状态等业务状态，避免把 LLM 运行状态和 PPT 阶段状态混成一个 store。

### 4.2 Conversation 渲染

`Conversation.tsx` 改为渲染统一 timeline：

- UserMessage 渲染普通用户项；
- 助手项显示流式文本；
- Skill、Read、Write、Edit、Glob、Grep 显示可折叠工具卡片；
- 流程事件复用现有确认资料、确认大纲、生成完成等卡片组件；
- queued/running/failed/cancelled 使用明确状态标记和操作按钮。

zai transcript 中标记为 `skill_injection` 的用户消息正文不渲染，避免 Skill Markdown 被错误显示成用户消息；SkillTool 调用本身仍显示。

### 4.3 输入接入

- idle 首次自由输入：先创建项目、打开项目，再入队原始消息。
- clarify：保留现有结构化字段；自然语言补充同时执行现有字段回填逻辑和 `chat.send`。
- sources、outline、complete：文本统一进入 chat queue；现有确认/生成按钮继续调用原业务 action，并在成功后追加 workflow event。
- 真实 assistant 回复替换当前硬编码的 agent 回复。
- LLM 结束后广播 `project-changed`，renderer 重新读取 ProjectDetail；因此对项目 slide 文件的 Write/Edit 结果能更新右侧预览。

### 4.4 工作流卡片与聊天顺序

工作流 action 成功后追加事件，timeline loader 根据 timestamp 把事件与 transcript 消息合并。当前状态仍由现有 stores 驱动，历史卡片由事件快照驱动；两者不互相覆盖。

---

## 5. 错误、恢复与数据安全

| 场景 | 行为 |
|---|---|
| API/网络/鉴权/限流错误 | 当前项 `failed`，显示错误与重试入口，暂停项目队列 |
| 用户取消 | 当前项 `cancelled`，保留记录并暂停队列 |
| 工具失败 | 工具卡片显示错误；按 runtime 结果结束或继续，最终失败时暂停队列 |
| 应用在 queued 状态退出 | 重开项目后自动继续 |
| 已写 transcript、未更新 queue 状态 | 按 `chat:<queueId>` 对账，不重复追加 |
| `conversation.json` 写入失败 | 保留原文件，返回错误，不静默丢弃用户输入 |
| transcript 不存在 | ChatService 先创建对应 transcript，再提交首条消息 |
| Skill 目录不存在或单个 Skill 损坏 | 依赖 loader 的跳过行为，聊天继续，记录警告 |
| 删除项目 | 先删除固定 transcript，再删除项目目录；队列和时间线一并消失 |

LLM 的 `cwd` 始终是当前项目目录；API Key 只在主进程读取设置并创建 model caller，不通过 preload 或 renderer 暴露。

---

## 6. 文件清单

### 新增

| 文件 | 作用 |
|---|---|
| `src/main/ipc/chat.ts` | ChatService、队列、runtime 调用、transcript/timeline 合并和 chat IPC |
| `src/renderer/stores/chat.ts` | 聊天时间线和运行状态 Zustand store |
| `tests/unit/main/ipc/chat.test.ts` | 队列、恢复、合并、skills 路径和删除清理测试 |
| `tests/unit/renderer/stores/chat.test.ts` | renderer chat store 事件与队列测试 |

### 修改

| 文件 | 变更 |
|---|---|
| `src/shared/ipc-channels.ts` | 增加 Chat IPC channel |
| `src/shared/types.ts` | 增加 Chat、Queue、WorkflowEvent 和 timeline 类型 |
| `src/preload/index.ts` | 暴露 chat invoke 与订阅 API |
| `src/main/ipc/index.ts` | 注册 chat IPC |
| `src/main/ipc/project.ts` | 删除项目时清理 transcript |
| `src/renderer/lib/api.ts` | 增加 BridgeApi.chat 类型 |
| `src/renderer/hooks/useWorkbenchSubscriptions.ts` | 订阅 Chat 事件并更新 store |
| `src/renderer/stores/workbench.ts` | 各阶段输入接入 chat，保留业务 action |
| `src/renderer/workbench/Conversation.tsx` | 改为统一 timeline renderer |
| `src/renderer/workbench/ClarificationFlow.tsx` | 显示真实 chat 历史和助手消息 |
| `src/renderer/workbench/ClarificationComposer.tsx` | 为补充背景输入增加 chat 发送能力 |
| `src/renderer/styles/workbench.css` | 工具卡片、队列和错误状态样式 |

不修改 `vendor/sdk.mjs` 或 vendored zai-agent-core；使用已有 runtime 公共接口。

---

## 7. 测试与验收

### 7.1 单元测试

1. `ChatService` 使用项目固定 transcript ID，且每轮只向 `~/.zn-agentic-ppt/skills` 传路径。
2. 多条消息 FIFO 执行；运行时第二条只入队不并行。
3. queued/submitted/running 状态在重启后正确恢复；`chat:<queueId>` 不重复追加。
4. 失败、取消会暂停队列；retry/continue/remove 更新状态正确。
5. transcript 消息、工具卡片、workflow event 和 queued item 合并顺序正确；Skill injection 正确隐藏。
6. 删除项目会清理 transcript、conversation 文件和 queue。
7. renderer 按 projectId 过滤事件，assistant delta、tool status 和 queue snapshot 更新正确。

### 7.2 集成验收

- 连续发送两条消息，第二条显示排队并按顺序执行。
- 队列未完成时完全退出 Electron，重新打开项目后自动继续。
- 重新打开项目可看到完整 user/assistant/tool/workflow 历史及原始顺序。
- 在 `~/.zn-agentic-ppt/skills/<name>/SKILL.md` 新增 Skill 后，下一轮可加载；`~/.zai/skills` 不生效。
- LLM 使用 Write/Edit 修改 slide 文件后，右侧预览刷新。
- 删除项目后对应会话文件不再存在。

### 7.3 必跑命令

```bash
bun run typecheck
bun run test
bun run build:main
bun run build
```

主进程改动后必须完全退出 Electron 并重新启动；仅 renderer reload 不足以验证 ChatService。

---

## 8. 实施顺序

1. 定义 shared Chat/Queue/Timeline 类型和 IPC channel。
2. 实现 ChatService：conversation 文件原子读写、队列、transcript 对账、skillsDirs、流事件和 runtime 调用。
3. 注册 preload/main IPC；接入项目删除清理。
4. 实现 renderer chat store 和事件订阅。
5. 将 Conversation、ClarificationFlow、ClarificationComposer 和 Workbench 输入接入真实 chat；保留确认按钮与业务 IPC。
6. 加入工具卡片、队列状态、错误操作和 project-changed 刷新。
7. 编写单元测试，执行 typecheck/test/build，并重启 Electron 做验收。

## 9. 关键不变量

- 一个项目只有一个固定 transcript 和一个串行 worker。
- LLM 上下文只从 transcript 恢复；UI 时间线不会被反向拼接成 prompt。
- 只有 `~/.zn-agentic-ppt/skills` 是 Skill 来源。
- LLM 不拥有业务阶段确认工具；关键工作流动作仍由用户按钮触发。
- 队列消息在未完成前不会丢失；失败/取消不会悄悄跳过。
- 删除项目不会留下可继续运行或可见的会话数据。
