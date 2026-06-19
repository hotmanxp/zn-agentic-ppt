# Stage 1「项目信息」重设计 — Design Spec

**日期**: 2026-06-19
**作者**: brainstorming 会话
**状态**: 已通过设计分节审阅,待用户审阅 spec

## 1. 背景

当前 Stage 1(CollectEditor)只有一个 `topic + source` 自由文本框,直接喂给 Stage 2 大纲 prompt。用户要的是更结构化的入口:把原始描述整理成 5 字段 `ProjectBrief`,并允许 LLM 在信息缺失时通过自定义 `AskUserQuestion` 工具反问用户,UI 弹 antd Modal 收集答案。

Stage 2 大纲生成不再读 `source`,只读 `ProjectBrief`。

## 2. 目标 / 非目标

**目标**
- Stage 1 页面标题改为「项目信息」
- 同一页内分两区:顶部 source 自由文本(保留)+ 底部 5 字段结构化表单
- 点「优化」调用主进程 LLM Agent,使用 `AskUserQuestion` 工具反问最多 2 轮
- 5 字段齐全后写盘;Stage 2 大纲 prompt 切换到只读 brief
- 旧数据(只有 source 无 brief)可继续使用,通过 brief=null 降级路径

**非目标**
- 不做 PPT 名称的重名校验(项目本身已有 ProjectMeta.title 字段)
- 不引入新的设计 token / UI 库
- 不改 Stage 3-4 任何东西
- 不做 LLM 端到端 e2e 自动测试(项目惯例)

## 3. 数据契约

```ts
// src/shared/types.ts 新增
export interface ProjectBrief {
  name: string            // PPT 名称(≤ 30 字)
  audience: string        // 演讲对象和场景(≤ 80 字)
  durationMinutes: number // 演讲时长(主输入,1-120 整数)
  pageCountEst: number    // 估算页数(派生,只读;clamp(round(durationMinutes/1.5), 3, 60))
  content: string         // 演讲内容(精炼 source,Markdown bullets,≤ 800 字)
  style: string           // 整体视觉风格(≤ 80 字)
}

// ProjectDetail.brief: ProjectBrief | null 新增字段
```

派生函数:

```ts
// src/shared/brief.ts
export function computePageCountEst(durationMinutes: number): number {
  return Math.max(3, Math.min(60, Math.round(durationMinutes / 1.5)))
}

export function validateBrief(raw: unknown): ProjectBrief {
  // 见第 5 节
}
```

## 4. 架构

### 4.1 1 句话

新增 **`BriefAgent`** — 主进程一个独立的对话子进程(GenerationRunner + SDK 内置 MCP server 装一个 `AskUserQuestion` 工具),与 Stage 2 大纲生成完全解耦。

### 4.2 模块边界

| 模块 | 职责 | 不知道什么 |
|------|------|-----------|
| **BriefAgent** (主进程新) | 注册 `AskUserQuestion` 工具 + 跑 SDK query + 解析最终 JSON + 维护 Promise↔IPC 映射 | UI 长啥样、字段存哪 |
| **renderPrompt('brief-optimize')** | 复用现有 prompt 系统 | LLM 工具调用细节 |
| **useBriefOptimizeStore** (renderer 新) | 维护 `idle/optimizing/asking/done/error` 状态 + 当前 question + 答案回调 | SDK、IPC |
| **ProjectBriefForm** (renderer 新) | 5 字段表单 + "优化" 按钮 + 角标 | 优化过程 |
| **AskUserQuestionModal** (renderer 新) | antd Modal 渲染 2-4 选项 + 取消 | 调用方是谁 |
| **CollectEditor** (改) | 拆上下两区;接 source 文本框 + brief 表单 | 优化内部 |

### 4.3 数据流

```
[renderer] CollectEditor 调 api.brief.optimize(id, currentBrief)
  ↓ IPC invoke STAGE_BRIEF_OPTIMIZE_START
[main]  ipc/brief.ts
       1) 读 source from project fs
       2) 构造 briefAgent.run({source, hint: currentBrief})
[main]  briefAgent.run():
       3) 构造 MCP server: name='brief-tools', tools=[AskUserQuestion]
       4) mcpServers 注入 GenerationRunner options
       5) renderPrompt('brief-optimize', {source, hintJson})
       6) runner.run() fire-and-forget;保存 AbortController
[main]  LLM 调 AskUserQuestion({questions:[...]}):
       7) handler 推问题给 askQueue
       8) broadcast STAGE_ASK_USER_QUESTION {qid, turn, questions}
[renderer] askOptimize store.applyQuestion → phase='asking'
            → 渲染 <AskUserQuestionModal>
            → 用户点选项 → 调 api.brief.answer(qid, value)
[main]  STAGE_BRIEF_OPTIMIZE_ANSWER handler
       9) askQueue.get(qid) resolve({cancelled:false, value})
[main]  handler return {content:[{type:'text', text: JSON.stringify(answer)}]}
       → LLM 拿到 tool result 继续 turn
[main]  重复 (7)-(9) 至 LLM 主动出最终 JSON
[main]  briefAgent 解析 buffer 中第一个完整 JSON 对象
       10) validateBrief() 校验 + 重写 pageCountEst
       11) broadcast STAGE_BRIEF_OPTIMIZE_DONE {brief}
[renderer] applyDone → phase='done' → 5 字段写入表单
```

### 4.4 异常路径

| 场景 | 行为 |
|------|------|
| LLM 在 2 轮后仍缺字段 | handler 第 3 次直接 return `{cancelled:true, reason:'max_turns'}`;systemPrompt 也写明 "2 轮后用现有信息 + 保守推断";UI 角标变 `已优化(N 字段为推测)` |
| LLM 始终不出 JSON | buffer 解析失败 → `STAGE_BRIEF_OPTIMIZE_ERROR` → 弹 antd `message.error`、按钮恢复、表单保持原值 |
| 用户在 Modal 中点取消 | handler resolve `{cancelled:true}` → tool result 是 cancelled → Agent 走 fallback |
| 用户关掉 Electron / 切页面 | runner interrupt() + AbortController abort;新一次"优化"覆盖旧的 |
| 并发两次"优化" | IPC handler 入口检查当前 active agent,有则 reject + 提示 |

## 5. 关键实现细节

### 5.1 BriefAgent 核心 (src/main/sdk/agents/briefAgent.ts)

```ts
import { tool, createSdkMcpServer } from '../../../vendor/sdk.mjs'
import { z } from 'zod'  // 或用 JSON Schema inline

interface AskUserRequest {
  qid: string
  turn: 1 | 2
  questions: Array<{
    question: string
    header: string   // ≤ 12 字
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
}

type AskAnswer =
  | { cancelled: false; value: string | string[] }
  | { cancelled: true; reason?: 'user_cancelled' | 'max_turns' }

class BriefAgent {
  private runner: GenerationRunner
  private abort = new AbortController()
  private askQueue = new Map<string, (r: AskAnswer) => void>()
  private turns = 0

  constructor(
    private opts: {
      cwd: string
      settings: Settings
      source: string
      hint: ProjectBrief | null
      onQuestion: (q: AskUserRequest) => void
      onDone: (b: ProjectBrief) => void
      onError: (e: AppError) => void
    }
  ) {}

  async run(): Promise<void> {
    const askUserQuestionTool = tool(
      'AskUserQuestion',
      'Ask the user 1-4 multiple-choice questions to fill missing information.',
      zodAskUserQuestionSchema,
      async (args) => {
        if (this.turns >= 2) {
          return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, reason: 'max_turns' }) }] }
        }
        this.turns++
        const qid = randomUUID()
        const answer = await new Promise<AskAnswer>((resolve) => {
          this.askQueue.set(qid, resolve)
          this.opts.onQuestion({ qid, turn: this.turns, questions: args.questions })
        })
        return { content: [{ type: 'text', text: JSON.stringify(answer) }] }
      },
    )

    const server = createSdkMcpServer({
      type: 'sdk',
      name: 'brief-tools',
      tools: [askUserQuestionTool],
    })

    const systemPrompt = await renderPrompt('brief-optimize', {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
    })

    this.runner = new GenerationRunner({
      cwd: this.opts.cwd,
      topic: '',
      outline: '',
      settings: this.opts.settings,
      runId: `brief:${randomUUID()}`,
      systemPrompt,
      userMessage: '请开始整理项目信息。',  // systemPrompt 已含全部指令
      mcpServers: { 'brief-tools': server },
      onEvent: () => {},
      onProgress: () => {},
      onDone: ({ html }) => this.handleDone(html),
      onError: ({ error }) => this.opts.onError({ code: 'INTERNAL', message: error.message, retryable: false }),
    })

    await this.runner.run()
  }

  cancel(): void { this.abort.abort(); this.runner?.interrupt() }
  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid)
    if (resolve) { this.askQueue.delete(qid); resolve(value) }
  }

  private handleDone(buffer: string): void {
    try {
      const obj = extractFirstJsonValue(buffer)
      this.opts.onDone(validateBrief(obj))
    } catch (e: any) {
      this.opts.onError({ code: 'PARSE', message: e?.message ?? String(e), retryable: true })
    }
  }
}
```

### 5.2 askUserQuestionSchema (Zod)

```ts
const askUserQuestionSchema = {
  questions: {
    type: 'array',
    minItems: 1,
    maxItems: 4,
    items: {
      type: 'object',
      required: ['question', 'header', 'options', 'multiSelect'],
      properties: {
        question: { type: 'string' },
        header: { type: 'string', maxLength: 12 },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            required: ['label'],
            properties: {
              label: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        multiSelect: { type: 'boolean' },
      },
    },
  },
}
```

(若 vendor SDK 接受 JSON Schema inline 更好,可避免引入 zod 依赖。实测时确认。)

### 5.3 useBriefOptimizeStore

```ts
type Phase = 'idle' | 'optimizing' | 'asking' | 'done' | 'error'

interface BriefOptimizeState {
  phase: Phase
  current: AskUserRequest | null
  error: string | null
  start: (id: string, hint: ProjectBrief | null) => Promise<void>
  cancel: () => Promise<void>
  answer: (qid: string, value: string | string[] | null) => void  // null = 取消
  applyDone: (brief: ProjectBrief) => void
  applyError: (e: AppError) => void
  reset: () => void
}
```

订阅:在 `start()` 内 `await api.brief.optimize()` 成功后才注册 `onAskUserQuestion / onDone / onError` 监听,避免 start 还没成功就漏事件。

### 5.4 AskUserQuestionModal

antd `<Modal>` 渲染:
- title = `current.questions[0].header`(短标签)
- body = 每个 question 一组 `Radio.Group`(options 数组渲染)
- footer = `[取消(走推断)]` `[确认]` 按钮
- `closable={false}` + `maskClosable={false}`(只允许选/取消)
- multiSelect 时换成 `Checkbox.Group`
- 多个 question 时纵向排列,统一一次确认提交(answers: {question1: label, question2: label})

### 5.5 CollectEditor 改写

```
顶部区 (现有 source 文本框 + topic)
  + hint: "本框内容仅供优化用,不会直接进大纲"

底部区 (新 ProjectBriefForm)
  - 5 字段只读/可编辑
  - 右上角角标:
    - 全空 → "点击右侧'优化'生成"
    - 优化后未改 → "✓ 已优化"
    - 用户改过 → "已编辑"
  - name: Input (max 30)
  - audience: TextArea (max 80, 字符计数)
  - durationMinutes: InputNumber (1-120) + 联动显示 "≈ {pageCountEst} 页"
  - content: TextArea (max 800, 字符计数, monospace)
  - style: Input (max 80)

按钮区
  - 「保存项目信息」: 写 source + brief 到 fs
  - 「优化」: 调 useBriefOptimizeStore.start()
  - 「下一步」(StageNav): canNext = (source.trim().length>0 && brief!=null)
```

## 6. Prompt 模板

### 6.1 `brief-optimize` (新)

**Default template** (in `src/main/sdk/prompts/brief-optimize.ts`):

```
你是 PPT 项目结构化助手。你的任务是把用户给的原始描述(可能很粗糙)整理成一个 5 字段的完整 brief。

【5 个字段】
1. name: PPT 名称(≤ 30 字)
2. audience: 演讲对象和场景(例: "面向企业 CTO 的技术分享,在 Q4 战略会上" — ≤ 80 字)
3. durationMinutes: 演讲时长(整数,1-120 分钟)
4. content: 演讲内容核心要点(精炼 source;Markdown bullets;≤ 800 字)
5. style: 整体视觉风格描述(例: "深色科技感、霓虹色点缀、code 风" — ≤ 80 字)

【工具:AskUserQuestion】
当你发现关键信息(source 没写、hint 也是空的)无法推断时,调 AskUserQuestion 工具追问。
- 一次最多 4 个 question;每个 question 必须 2-4 个 option
- header 字段 ≤ 12 字(会在 UI 上当 Modal 标题)
- 最多调用 2 轮。第 2 轮 tool result 如果是 {cancelled:true} 表示用户跳过了,用现有信息走保守推断
- 调用 AskUserQuestion 之前先用 chain-of-thought 说明你要问什么

【输入】
hint(现有结构化字段,可能全空,可能部分有):
{{hintJson}}

source(用户原始描述,可能很粗糙):
{{source}}

【输出】
完成所有追问(到达上限 / 用户取消 / 你已经能填全 5 字段)后,输出最终 JSON(不要解释,直接输出):
{
  "name": "...",
  "audience": "...",
  "durationMinutes": 30,
  "content": "...",
  "style": "..."
}
```

**Variables**:
- `source` (string) — 用户原始描述
- `hintJson` (string) — 现有结构化字段 JSON 字符串

### 6.2 `outline` (改: 切换到读 brief)

**Variables**(替换原 `topic` / `source`):
- `briefName` (string)
- `briefAudience` (string)
- `briefDurationMinutes` (string)
- `briefContent` (string)
- `briefStyle` (string)

**模板片段替换**:把原 `{{topic}}` `{{source}}` 段替换为:
```
【项目 brief】
名称: {{briefName}}
演讲对象: {{briefAudience}}
时长: {{briefDurationMinutes}} 分钟
内容:
{{briefContent}}
风格: {{briefStyle}}
```

**调用方降级路径**(`src/main/ipc/stage.ts` 的 outline handler):
```ts
const project = await fs.getProject(id)
const brief = project.brief
if (brief) {
  await renderPrompt('outline', {
    briefName: brief.name,
    briefAudience: brief.audience,
    briefDurationMinutes: brief.durationMinutes.toString(),
    briefContent: brief.content,
    briefStyle: brief.style,
  })
} else {
  logger.warn('brief-fallback, using topic+source for project', id)
  await renderPrompt('outline', {
    topic: project.topic,
    source: project.source ?? '',
  })  // 临时支持旧模板 + 旧变量
}
```

(降级路径临时保留旧变量;后续删 `topic`/`source` 变量时,所有项目都跑过 Stage 1 优化后可彻底清掉。)

## 7. IPC 三件套

| 方向 | Channel | Preload |
|------|---------|---------|
| invoke | `STAGE_BRIEF_OPTIMIZE_START` | `api.brief.optimize(id, hint)` |
| invoke | `STAGE_BRIEF_OPTIMIZE_CANCEL` | `api.brief.cancel()` |
| invoke | `STAGE_BRIEF_OPTIMIZE_ANSWER` | `api.brief.answer(qid, value)` |
| push  | `STAGE_ASK_USER_QUESTION`     | `api.brief.onAskUserQuestion(cb)` |
| push  | `STAGE_BRIEF_OPTIMIZE_DONE`   | `api.brief.onDone(cb)` |
| push  | `STAGE_BRIEF_OPTIMIZE_ERROR`  | `api.brief.onError(cb)` |

按项目 memory 规则:channel 加在 `src/shared/ipc-channels.ts`、handler 加在 `src/main/ipc/brief.ts`、bridge 加在 `src/preload/index.ts`,**三个都接**才不静默失败。

## 8. 文件清单

**新增 6 个**
- `src/main/sdk/agents/briefAgent.ts` — BriefAgent 类
- `src/main/sdk/prompts/brief-optimize.ts` — PromptSpec
- `src/main/ipc/brief.ts` — IPC handler 集中点
- `src/renderer/stores/briefOptimize.ts` — Zustand store
- `src/renderer/components/ProjectBriefForm.tsx` — 5 字段表单
- `src/renderer/components/AskUserQuestionModal.tsx` — 弹窗
- `src/shared/brief.ts` — computePageCountEst + validateBrief
- `tests/unit/main/sdk/agents/briefAgent.test.ts`
- `tests/unit/shared/brief.test.ts`
- `tests/unit/main/ipc/brief.test.ts`

**改 7 个**
- `src/shared/ipc-channels.ts` — 加 6 个 channel
- `src/shared/types.ts` — 加 `ProjectBrief` + `ProjectDetail.brief`
- `src/preload/index.ts` — 暴露 `brief.*` 方法
- `src/renderer/routes/CollectEditor.tsx` — 拆两区 + 接 store
- `src/main/sdk/prompts/index.ts` — register `brief-optimize`
- `src/main/sdk/prompts/outline.ts` — 切到读 brief
- `src/main/ipc/stage.ts` — outline handler 读 brief + 降级
- `src/main/fs/projects.ts` — `readProjectBrief` / `writeProjectBrief`
- `src/renderer/components/PromptSettings.tsx` — `PROMPT_METADATA` 加 `brief-optimize`

## 9. 测试 & 验证

### 9.1 单元测试 (注入 sdkEvents, 无 live LLM)

`tests/unit/main/sdk/agents/briefAgent.test.ts`:
- happy path: 1 次 tool_use AskUserQuestion + tool_result + 最终 JSON → 验证 onQuestion 1 次、onDone 收到完整 brief、pageCountEst 已重算
- max_turns: 3 次 tool_use → 第 3 次 handler 返回 `{cancelled:true, reason:'max_turns'}`, 不再 push
- cancel 路径: agent.cancel() 后再 answer() → resolve 被忽略
- JSON 解析失败: buffer 无完整 JSON → onError code:PARSE
- 字段缺漏: 最终 JSON 缺 content → onError code:PARSE 'brief.content 缺失'

`tests/unit/shared/brief.test.ts`:
- computePageCountEst 边界(1, 1.5, 30, 120)
- validateBrief 各种缺字段 / 类型错误

`tests/unit/main/ipc/brief.test.ts`:
- mock BriefAgent 注入 ipcMain.handle
- 4 个 channel 都能 invoke + push
- answer(qid) 路由到正确 agent

### 9.2 Live 验证 (手测, 不写 e2e)

```bash
bun run typecheck
bun run test
bun run build:main   # 主进程改完必跑
# Cmd+Q 完全退出 Electron
bun run dev
```

手测清单:
- [ ] CollectEditor 标题变成「项目信息」
- [ ] source 框 + 结构化区都在同一页
- [ ] 点「优化」 → 进度条出现
- [ ] LLM 调 AskUserQuestion → antd Modal 弹出,header 短标签
- [ ] 选项 2-4 个,点选项关闭、点取消也关闭
- [ ] 完成后 5 字段填好,角标「✓ 已优化」
- [ ] 改一个字段 → 角标变「已编辑」, dirty=true
- [ ] 「保存项目信息」 → 重进页面字段保留
- [ ] 「下一步」 → /projects/:id/outline, 大纲基于 brief(不再读 source)
- [ ] 老数据: 删字段后 source 还在 → CollectEditor 仍能进,「下一步」提示先优化
- [ ] 旧项目无 brief → stage.ts 降级到 topic+source, 日志打 `brief-fallback`

## 10. 风险 & 缓解

| 风险 | 缓解 |
|------|------|
| vendor SDK `tool()` 行为与上游有偏差 | 合入前在 `.agent_working_dir/` 跑一次 live probe, 确认 AskUserQuestion tool 真能被 LLM 调起 + handler return 的 `content: [{type:'text', text}]` 真能被 LLM 当 tool_result 用 |
| LLM 调 AskUserQuestion 超过 2 轮不收敛 | handler 第 3 次直接 return `{cancelled:true, reason:'max_turns'}`; systemPrompt 也写明"2 轮后用现有信息 + 保守推断" |
| 用户在 Modal 中点取消后 LLM 仍出残缺 JSON | validateBrief 兜底, 缺字段抛 PARSE, UI 给 retry 按钮 |
| IPC 双向同步死锁 | askQueue 是 Map + qid 路由; answer handler 不阻塞, 只 resolve; turns 单调递增, handler 同步判断 |
| 并发两次"优化" | IPC handler 入口检查 active agent, 有则 reject + 提示 |
| outline prompt 切换后老项目无 brief | stage.ts handler 检测 brief==null 时降级用 `project.topic + project.source` 喂老 prompt(临时 fallback), 日志打 `brief-fallback`, **不**抛错 |
| 主进程改了必须 rebuild | AGENTS.md 已要求, 自测时严格 `bun run build:main` + 完全退出 Electron |
| renderPrompt 找不到 prompt id | `registerPrompt` 在 `src/main/sdk/prompts/index.ts` 末尾统一注册, 漏注册会立即 throw |
| `useBriefOptimizeStore` 漏事件 | start() 内 await IPC 成功后才订阅 onAskUserQuestion/onDone/onError |
| 旧 outline prompt 模板里还引用 `{{topic}}` / `{{source}` | 改 outline.ts 时 grep 全仓库确保无残留, 否则 renderPrompt 抛 "未声明变量" |

## 11. 后续可做 (本次不做)

- 把 5 字段做成可拖拽重排
- brief 历史版本 (每次优化存一版, 支持 diff/回滚)
- 把 AskUserQuestion 工具暴露给 Stage 2/3 的 agent (统一 question UX)
- brief 通过 OutlineGlobalStyle 自动推到 slide-system prompt 的视觉风格变量
