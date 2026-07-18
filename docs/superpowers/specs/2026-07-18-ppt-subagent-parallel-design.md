# PPT Slide Generation — Sub-Agent Parallel Delegation

**Date:** 2026-07-18
**Status:** Draft (awaiting user review)
**Author:** Codex brainstorming session
**Branch:** `codex/ppt-subagent-parallel`

## Context

`approveOutline` 触发三段流水线（intent → outline re-run → HTML 生成），其中第三段
`pptGen.start(id)` 调 `runOrchestrator`（`src/main/sdk/ppt-orchestrator.ts`）目前用
手写 3 并发 worker pool：每个 worker 直接调 `runZaiQuery` 一次，期望 LLM 一次性
吐出完整 HTML。

痛点：
- 30 张 slide 端到端生成 5-8 分钟（3 路并发上限）
- 单 slide 是无工具回路的纯 prompt 生成，无法读邻居 slide 校准风格，写完无法自检
- 重试 / abort / 进度跟踪都是手写代码（~270 行 `ppt-orchestrator.ts`）

`zai-agent-core` runtime 已自带 `AgentTool` + `BackgroundRuntime` 子 agent 派发能力，
所以可以用"父 agent 编排 + N 个子 agent 并行生成"替换 worker pool。

## Goal

把 `runOrchestrator` 替换成"父 agent + sub-agent 并行委托"，达成：

1. **真并行**：父 agent 第一轮 turn 同时派 N 个 `Agent(run_in_background=true)`，
   BackgroundRuntime 立即派发，不阻塞等任何子 agent
2. **质量**：子 agent 有 Read/Write/Edit 工具，能读邻居 slide + 自检 + 用 Edit 迭代；
   父 agent 在 `<task-notification>` 到达时 Read 文件做 6 项硬指标检查，不通过则派
   重试 agent 并附反馈
3. **简化**：删 worker pool / retry 循环 / abort 循环，文件从 271 行降到 ~150 行

## Non-Goals

- 不动 `intent.run`（stage 1）和 `stageStream.start("outline", id)`（stage 2）
- 不动 renderer stores / IPC payload 形状
- 不引入自定义 agent 定义文件（用内置 `general-purpose`，PPT 规则塞 per-slide prompt）
- 不给 renderer 加 "retrying" 状态（黑盒即可）
- 不做跨项目的并发控制（同一项目只允许一次生成仍是 stage.ts 的不变式）

## Architecture

### 数据流总览

```
[主进程] stage.ts → STAGE_HTML_GENERATE
   ↓
runOrchestrator(id, outline, intent, style, settings)
   ├─ buildParentPrompt(...)               // 静态父 system prompt
   ├─ buildSubAgentPrompts(slides, ...)    // 预渲染 N 个 per-slide prompt
   ↓
parentStream = runZaiQuery({
  systemPrompt:   PPT_PARENT_SYSTEM_PROMPT,
  userMessage:    PPT_PARENT_USER_PROMPT,
  additionalTools: PARENT_AGENT_TOOLS,     // Agent + Read + Glob + Grep
  maxTurns: 50,
  signal,
})
   ↓
for await ev of parentStream:
   ├─ 'subagent:start' → slideState[slideId].dispatchCount++;
   │                       if dispatchCount === 1: broadcast STAGE_HTML_SLIDE_READY status:layout
   ├─ 'subagent:done'  → readFile(slides/<slideId>.html) → broadcast status:done|failed
   └─ 'runtime.done' | 'runtime.error' | 'runtime.aborted'
                          → 统计 slideState → broadcast STAGE_HTML_GENERATE_DONE
```

### 子 agent（general-purpose）

无 agent 定义文件，直接用内置 `general-purpose`。每张 slide 的指令由主进程预渲染成
完整 user prompt。子 agent 继承 `SUB_AGENT_TOOLS = [Read, Write, Edit, Glob, Grep]`。

**Per-slide prompt 模板**（`prompts/ppt-slide-generator.md`）：

```
你是单张 PPT slide 的生成 agent。

## 产出
1 个 HTML <section> 块，写到 slides/<slideId>.html

## 当前任务
- slideId: {{slideId}}
- title: {{title}}
- bullets: {{bullets}}
- notes: {{notes}}
- layout: {{layout}} （视觉方向：{{layoutDirection}}）
- 邻居 slide 文件（用 Read 看风格一致性）: {{neighborPaths}}
- 全局样式（主色 / 强调色 / 字体）: {{style}}

## 视觉规则
- 16:9 aspect ratio（1280x720）
- 必须 inline style（不用 class）
- <section data-layout="N"> 包裹
- 五种 layout 视觉方向（参考 layouts.md）

## 工作流
1. Read 邻居 slide 文件了解风格一致性
2. Write 初始 HTML 到 slides/<slideId>.html
3. Read 自己刚写的文件
4. 自检：结构闭合、data-layout、关键元素齐全
5. 不通过 → Edit 工具修复（最多 3 轮自迭代）
6. 最后输出简短报告：完成 / 修改了 X 处 / 内容覆盖了 Y
```

### 父 agent

主进程直接调 `runZaiQuery` 启动父 agent。system prompt 强调"验证产出物"，不要
JSON 摘要、不要写文件。

**父 agent system prompt 模板**（`prompts/ppt-parent-system.md`）：

```
你是 PPT 编排 agent。任务：让 N 张 slide 的产出物 (slides/<id>.html)
全部通过你的质量验证。

## 工具
- Agent(ppt-slide-generator 任务, run_in_background=true)：派发子 agent
- Read / Glob / Grep：浏览项目目录、读 slide 文件做检查

## 验证标准（针对每张 slide，Read 后判断）
✅ 文件存在且非空
✅ 包含 <section> 元素
✅ data-layout="N" 跟指定 layout 一致
✅ HTML 结构闭合（无 syntax error）
✅ 长度 > 200 字符
✅ 跟 1-2 张邻居 slide 视觉风格不冲突

## 不通过 → 派 Agent 重试
prompt 里附具体反馈。例："邻居 slide 用了 #2563EB 主色，你这页用了
#DC2626，请统一为蓝色调"。

## 工作流
1. 第一轮 turn：并行派 N 个 Agent 工具调用（run_in_background: true）
   每个 description 形如 "Generate slide <slideId>"
2. 每个 <task-notification> 到达：
   a. Read slides/<id>.html
   b. 跑上面 6 条验证
   c. 不通过 → 派新 Agent 重试（每张最多 2 次）
   d. 通过 → 无需动作
3. 全部 slide 验证通过 → runtime 自然结束（无需输出特殊 summary）

## 不要做
- 不要输出 JSON 摘要（主进程自己统计）
- 不要 Write/Edit 文件

## 关键约束
- max_turns=50
- description 必须含 slideId，方便后续 turn 识别通知
```

**父 agent user prompt**（`prompts/ppt-parent-user.md`）由主进程预渲染：

```
## Outline 摘要
{{outlineSummary}}

## Intent（来自 intent.json）
{{intentJson}}

## Style（来自 style.json）
{{styleJson}}

## 待生成 slides
{{slidesJson}}    // [{id, title, layout, ...}]

## 子 agent 指令（已预渲染，直接 dispatch，不要改）
{{subAgentPromptsJson}}   // [{slideId, prompt}, ...]

## 任务
对每张 slide 派发一个 Agent 工具调用（subagent_type=general-purpose,
run_in_background=true, description="Generate slide <slideId>",
prompt=上面数组里对应 slideId 的 prompt）。

第一轮 turn 全部一起发，不要分批。
```

### 主进程事件桥（详细）

```
class OrchestratorState {
  slideState: Map<slideId, {
    status: 'layout' | 'done' | 'failed',
    html?: string,
    error?: string,
    dispatchCount: number
  }>
  subSessionMap: Map<subSessionId, slideId>
}

for await (const ev of parentStream) {
  switch (ev.type) {
    case 'subagent:start': {
      const slideId = parseSlideIdFromDescription(ev.description);
      subSessionMap.set(ev.subSessionId, slideId);
      const s = ensureSlideState(slideId);
      s.dispatchCount++;
      if (s.dispatchCount === 1) {
        s.status = 'layout';
        broadcast(STAGE_HTML_SLIDE_READY, { projectId, slideId, status: 'layout', total });
      }
      break;
    }
    case 'subagent:done': {
      const slideId = subSessionMap.get(ev.subSessionId);
      if (!slideId) break;
      const html = await tryReadFile(slidesDir + slideId + '.html');
      const s = ensureSlideState(slideId);
      if (ev.exitReason === 'completed' && html) {
        s.status = 'done';
        s.html = html;
        broadcast(STAGE_HTML_SLIDE_READY, { projectId, slideId, status: 'done', html, total });
      } else {
        s.status = 'failed';
        s.error = ev.output ?? `exitReason=${ev.exitReason}`;
        broadcast(STAGE_HTML_SLIDE_READY, { projectId, slideId, status: 'failed', error: s.error, total });
      }
      break;
    }
    case 'runtime.done':
    case 'runtime.error':
    case 'runtime.aborted': {
      const cancelled = ev.type === 'runtime.aborted';
      const completed = count(slideState, s => s.status === 'done');
      const failed = count(slideState, s => s.status === 'failed');
      const total = outline.slides.length;
      broadcast(STAGE_HTML_GENERATE_DONE, { projectId, completed, failed, total, cancelled });
      setProjectStatus(id, failed > 0 && completed === 0 ? 'failed' : 'generated');
      return;
    }
  }
}
```

### Zai-bridge 工具拆分

当前 `BRIDGE_TOOLS` 显式排除了 `AgentTool`。拆成两套：

```ts
// src/main/sdk/zai-bridge.ts
export const SUB_AGENT_TOOLS: Tool[] = [
  FileReadTool, FileWriteTool, FileEditTool, GlobTool, GrepTool
].map(wrapAsOpenccTool);

export const PARENT_AGENT_TOOLS: Tool[] = [
  FileReadTool, GlobTool, GrepTool, AgentTool
].map(wrapAsOpenccTool);
```

`runZaiQuery` 通过 `additionalTools` 参数决定哪套。**注意**：`AgentTool` 当前没在
`zai-bridge.ts` import — 需要加一行。

## Files Changed

| 文件 | 改动 |
|---|---|
| `src/main/sdk/ppt-orchestrator.ts` | **重写** `runOrchestrator`：删 worker pool；改成 build prompts → runZaiQuery → event bridge。文件从 271 行 → ~150 行 |
| `src/main/sdk/zai-bridge.ts` | 拆 `BRIDGE_TOOLS` → `SUB_AGENT_TOOLS` + `PARENT_AGENT_TOOLS`；import 并 wrap `AgentTool`；`runZaiQuery` 暴露 `additionalTools` 参数 |
| `src/main/sdk/prompts/ppt-parent-system.md` | **新建**：父 agent system prompt 模板 |
| `src/main/sdk/prompts/ppt-parent-user.md` | **新建**：父 agent user prompt 模板（outline/intent/style/slide 上下文占位符） |
| `src/main/sdk/prompts/ppt-slide-generator.md` | **新建**：子 agent per-slide prompt 模板 |
| `src/main/sdk/prompts.ts` | 注册上述三个新模板 |
| `src/main/ipc/stage.ts` | **不改**：仍调 `runOrchestrator`，签名不变 |
| `src/renderer/**` | **不改**：renderer store / IPC payload 形状不变 |
| `src/shared/**` | **不改** |

净增 ~3 个 prompt 模板文件 + 1 个文件改写 + 1 个文件加工具拆分。

## Testing

### 现有测试

`ppt-orchestrator.ts` 现有 `__tests__` 测试调 `runOrchestrator` 函数。
签名不变 → 现有测试应该继续 pass。如果有 mock `GenerationRunner` 的测试，
需要更新 mock 让它支持 `additionalTools` 参数。

### 新增测试

1. **`ppt-orchestrator.test.ts`**：mock `runZaiQuery` 发出 canned 事件流
   - 测试 `subagent:start` 第一次触发 layout 广播，第二次不触发（无 flicker）
   - 测试 `subagent:done` + html 文件存在 → done 广播 + html 字段
   - 测试 `subagent:done` + 文件不存在 → failed 广播
   - 测试 `runtime.done` → STAGE_HTML_GENERATE_DONE 广播含正确 completed/failed/total
   - 测试 `runtime.aborted` → cancelled: true 广播

2. **`ppt-prompts.test.ts`**：三个新模板的 render 函数
   - 验证占位符替换正确
   - 验证父 agent prompt 不含 "输出 JSON" 字样
   - 验证子 agent prompt 包含 6 条自检规则

3. **`zai-bridge.test.ts`**（补充）：
   - 验证 `SUB_AGENT_TOOLS` 不含 `AgentTool`
   - 验证 `PARENT_AGENT_TOOLS` 含 `AgentTool`

### E2E

- `tests/e2e/ppt-subagent-cancel.spec.ts`：触发生成 → 5 秒后取消 → 验证
  `STAGE_HTML_GENERATE_DONE { cancelled: true }` 在 10 秒内到达（验证
  BackgroundRuntime abortSignal 是否真的传到子 agent——这是唯一 spec 设计点）
- 现有 `ppt-generation.spec.ts`：不需要改

## Risks

| 风险 | 缓解 |
|---|---|
| 父 LLM 不在第一轮 turn 并行发 N 个 Agent 调用 | system prompt 强约束"全部一起发"；fallback：测试发现后改 prompt 或拆分 turn |
| BackgroundRuntime 的子 agent 不响应父 abortSignal | e2e 测试验证；如不响应，用户取消后等几秒看到 done，不致命 |
| 父 LLM 在 max_turns 前没验证完所有 slide | max_turns=50 远超 N（一般 30 张），足够；fallback：runtime.error 兜底广播剩余为 failed |
| 子 agent 写文件失败（无 Write 工具权限错误） | 子 agent 工具白名单显式包含 WriteTool；如真发生 → broadcast failed → 父 agent 决定 retry |
| prompt 体积膨胀 | per-slide prompt ~1500 token；30 张约 45k（父 agent user message 一次性 45k）。如超上下文，拆成 chunked 派发（v2） |


## Open Questions

1. **BackgroundRuntime abortSignal 传播**：zai-agent-core 的 BackgroundRuntime 是否把父 agent 的 abortSignal 传到 `dispatch()` 的 task metadata。验证：见 Testing §E2E 的 cancel e2e。如果不传，cancel 后子 agent 仍会跑完——可接受但不理想。

本次 brainstorming 已收敛：动机（1/2/3）、范围（仅 slide HTML 生成）、
架构（父 agent + general-purpose sub-agent + 6 条验证 + retry）、
事件桥（slideState 计数 + dispatchCount 防 flicker）。


## Migration / Rollout

1. 改写 `ppt-orchestrator.ts` + `zai-bridge.ts` 工具拆分
2. 新增三个 prompt 模板文件
3. 跑 `bun run typecheck` + `bun run test`
4. 跑 e2e cancel 测试
5. `bun run build:main` 重建主进程 bundle
6. 重启 Electron 验证（Cmd+Q → bun run dev）
7. 现有项目跑一次完整 outline→generation 流程，看 slide 质量
8. 观察父 agent token 消耗（OpenTelemetry 日志）

无 feature flag / 无 dark launch：这是 internal 重构，IPC 协议 0 改动，
renderer 不感知。回滚 = `git revert` + `bun run build:main`。
