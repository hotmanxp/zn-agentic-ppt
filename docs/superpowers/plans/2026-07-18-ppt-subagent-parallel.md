# PPT Slide Generation Sub-Agent Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `runOrchestrator` 从手写 worker pool 替换成"父 agent 编排 + N 个 general-purpose 子 agent 并行生成"，由子 agent 自己用 Write 工具写文件、由父 agent 用 Read 工具做 6 项硬指标验证。

**Architecture:** 单次 `runZaiQuery` 调用启动父 agent（system prompt 来自 `PPT_PARENT_SYSTEM_PROMPT` 模板），父 agent 第一轮 turn 并行发 N 个 `Agent(subagent_type=general-purpose, run_in_background=true)` 工具调用，BackgroundRuntime 派发子 agent 并行执行。主进程监听父 stream，把 `subagent:start` / `subagent:done` / `runtime.*` 事件桥接成现有 `STAGE_HTML_SLIDE_READY` / `STAGE_HTML_GENERATE_DONE` 广播，renderer 协议 0 改动。

**Tech Stack:** TypeScript · Electron · React 18 · Ant Design · Zustand · Vitest · Bun · esbuild ESM (Node 20) · zai-agent-core runtime

**Specification:** `docs/superpowers/specs/2026-07-18-ppt-subagent-parallel-design.md`

## Global Constraints

- 主进程改动限制在 4 个文件：`src/main/sdk/zai-bridge.ts`、`src/main/sdk/ppt-orchestrator.ts`、`src/main/sdk/prompts/index.ts`、新增的 3 个 prompt 模板文件。
- Renderer 0 改动（store / IPC payload 形状不变）。
- 不引入新 npm / Bun 依赖。
- 每个子 agent 工具集 = `[Read, Write, Edit, Glob, Grep]`，不含 `Agent`（单 slide 任务不递归）。
- 父 agent 工具集 = `[Read, Glob, Grep, Agent]`，不含 `Write / Edit`（父不写文件）。
- 父 agent `maxTurns = 50`，描述每个子任务时 `description` 必须含 `slideId`。
- 子 agent `run_in_background = true`（真并行）。
- 每张 slide 最多 retry 2 次（system prompt 强约束）。
- 因为改 `src/main/**`，最终必须 `bun run build:main` 并完全重启 Electron。
- `AgentTool` 当前未在 `zai-bridge.ts` import；需加 import + `wrapAsOpenccTool`。
- 任何 commit 步骤只有在用户明确授权后才能执行；未授权时跳过 commit，不 amend、不跳过 hooks。

## File Structure

### Create

- `src/main/sdk/prompts/ppt-parent-system.ts` — 父 agent system prompt 模板（PPT_PARENT_SYSTEM_PROMPT）
- `src/main/sdk/prompts/ppt-parent-user.ts` — 父 agent user prompt 模板（PPT_PARENT_USER_PROMPT）
- `src/main/sdk/prompts/ppt-slide-generator.ts` — 子 agent per-slide prompt 模板（PPT_SLIDE_GENERATOR_PROMPT）
- `tests/unit/main/sdk/zai-bridge-tools.test.ts` — `SUB_AGENT_TOOLS` / `PARENT_AGENT_TOOLS` 拆分 + `additionalTools` 参数
- `tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts` — 3 个新模板的 render 测试
- `tests/unit/main/sdk/ppt-orchestrator.test.ts` — runOrchestrator 改写后的事件桥接行为
- `tests/e2e/ppt-subagent-cancel.spec.ts` — 验证 BackgroundRuntime abortSignal 是否传到子 agent

### Modify

- `src/main/sdk/zai-bridge.ts` — 拆分 BRIDGE_TOOLS；import AgentTool；runZaiQuery 增加 `additionalTools` 参数
- `src/main/sdk/prompts/index.ts` — 注册 3 个新模板
- `src/main/sdk/ppt-orchestrator.ts` — 重写 runOrchestrator；删 worker pool；改成 build prompts + runZaiQuery + event bridge

### Not Modified

- `src/main/ipc/stage.ts` — 仍调 `runOrchestrator(opts)`，签名不变
- `src/renderer/**` — store / IPC payload 形状不变
- `src/shared/**` — 类型不变

---

### Task 1: zai-bridge 工具集拆分（SUB_AGENT_TOOLS / PARENT_AGENT_TOOLS）

**Files:**
- Modify: `src/main/sdk/zai-bridge.ts:104-117` — 拆 BRIDGE_TOOLS
- Modify: `src/main/sdk/zai-bridge.ts:32-40` — 加 AgentTool import
- Test: `tests/unit/main/sdk/zai-bridge-tools.test.ts`（新建）

**Interfaces:**
- Produces: `SUB_AGENT_TOOLS: Tool[]` = 5 个工具（FileRead / FileWrite / FileEdit / Glob / Grep）
- Produces: `PARENT_AGENT_TOOLS: Tool[]` = 4 个工具（FileRead / Glob / Grep / Agent）
- Guarantees: `SUB_AGENT_TOOLS` 不含 `AgentTool`；`PARENT_AGENT_TOOLS` 含 `AgentTool` 且不含 `FileWriteTool` / `FileEditTool`

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/main/sdk/zai-bridge-tools.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

import { SUB_AGENT_TOOLS, PARENT_AGENT_TOOLS } from "../../../../src/main/sdk/zai-bridge.js";

function toolNames(tools: { name: string }[]): string[] {
  return tools.map((t) => t.name).sort();
}

describe("zai-bridge tool sets", () => {
  it("SUB_AGENT_TOOLS contains read/write/edit/glob/grep but no Agent", () => {
    expect(toolNames(SUB_AGENT_TOOLS)).toEqual(
      ["Edit", "Glob", "Grep", "Read", "Write"].sort(),
    );
  });

  it("PARENT_AGENT_TOOLS contains read/glob/grep/agent but no write/edit", () => {
    expect(toolNames(PARENT_AGENT_TOOLS)).toEqual(
      ["Agent", "Glob", "Grep", "Read"].sort(),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-tools.test.ts
```

Expected: FAIL — `SUB_AGENT_TOOLS` / `PARENT_AGENT_TOOLS` 未导出。

- [ ] **Step 3: 在 zai-bridge.ts 加 AgentTool import**

修改 `src/main/sdk/zai-bridge.ts:32-40`（import 区），新增：

```ts
import { AgentTool } from "./zai-agent-core/tools/AgentTool/AgentTool.js";
```

> 注：具体行号以当前文件为准；关键是 AgentTool 加入 import 列表。

- [ ] **Step 4: 把 BRIDGE_TOOLS 拆成两套**

修改 `src/main/sdk/zai-bridge.ts:104-117`（`BRIDGE_TOOLS` 声明附近）：

```ts
// 子 agent 工具集：单 slide 生成 + 自检 + Edit 迭代
// （不含 Agent —— 单 slide 任务不递归）
export const SUB_AGENT_TOOLS: Tool[] = [
  wrapAsOpenccTool(FileReadTool),
  wrapAsOpenccTool(FileWriteTool),
  wrapAsOpenccTool(FileEditTool),
  wrapAsOpenccTool(GlobTool),
  wrapAsOpenccTool(GrepTool),
];

// 父 agent 工具集：派发子任务 + 检阅子 agent 产出
// （不含 Write/Edit —— 父 agent 不写文件）
export const PARENT_AGENT_TOOLS: Tool[] = [
  wrapAsOpenccTool(FileReadTool),
  wrapAsOpenccTool(GlobTool),
  wrapAsOpenccTool(GrepTool),
  wrapAsOpenccTool(AgentTool),
];

// 保留 BRIDGE_TOOLS 别名指向 SUB_AGENT_TOOLS，向后兼容旧调用点
export const BRIDGE_TOOLS: Tool[] = SUB_AGENT_TOOLS;
```

- [ ] **Step 5: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-tools.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/zai-bridge.ts tests/unit/main/sdk/zai-bridge-tools.test.ts
git commit -m "refactor(zai-bridge): split SUB_AGENT_TOOLS / PARENT_AGENT_TOOLS"
```

---

### Task 2: runZaiQuery 支持 additionalTools 参数

**Files:**
- Modify: `src/main/sdk/zai-bridge.ts`（`runZaiQuery` 函数签名 + 实现）
- Test: `tests/unit/main/sdk/zai-bridge-tools.test.ts`（追加测试）

**Interfaces:**
- Produces: `runZaiQuery` 接收 `additionalTools?: Tool[]` 参数
- Guarantees: 不传 `additionalTools` 时行为不变（fallback 到 SUB_AGENT_TOOLS）；传入则用传入的工具集

- [ ] **Step 1: 写失败测试**

在 `tests/unit/main/sdk/zai-bridge-tools.test.ts` 末尾追加：

```ts
import { runZaiQuery } from "../../../../src/main/sdk/zai-bridge.js";

describe("runZaiQuery additionalTools", () => {
  it("accepts an additionalTools parameter without throwing", async () => {
    // 我们不真跑 LLM（runZaiQuery 会立刻发起 stream），只验证签名允许传
    // additionalTools。如果类型错误这里会编译失败。
    const stream = runZaiQuery({
      prompt: "ping",
      cwd: "/tmp",
      model: "claude-test",
      systemPrompt: "sys",
      maxTurns: 1,
      baseUrl: "https://x",
      apiKey: "sk-fake",
      additionalTools: PARENT_AGENT_TOOLS,
    });
    // 拿到 AsyncIterable 即可，无需 await
    expect(typeof stream[Symbol.asyncIterator]).toBe("function");
    // 关闭 stream 防泄漏
    await stream.return?.(undefined as any);
  });
});
```

- [ ] **Step 2: 跑测试确认 RED（编译错）**

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-tools.test.ts
```

Expected: 编译失败 —— `additionalTools` 不在 `runZaiQuery` 参数类型里。

- [ ] **Step 3: 改 runZaiQuery 签名 + 实现**

找到 `src/main/sdk/zai-bridge.ts` 里的 `runZaiQuery` 函数定义（导出函数）。修改变量声明区附近：

```ts
export async function* runZaiQuery(opts: {
  prompt: string;
  cwd: string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  baseUrl?: string;
  apiKey?: string;
  /** Override the default SUB_AGENT_TOOLS. Pass PARENT_AGENT_TOOLS for the
   *  orchestrator parent. If omitted, falls back to SUB_AGENT_TOOLS. */
  additionalTools?: Tool[];
}): AsyncIterable<BridgedEvent> {
  // 现有实现保持不变；在 tools 装配那行加 fallback：
  //   const tools = opts.additionalTools ?? SUB_AGENT_TOOLS;
  // 把原本写死 BRIDGE_TOOLS 的地方换成 tools。
}
```

> 关键改动 1 行：tools 解析从硬编码 `BRIDGE_TOOLS` 改为 `opts.additionalTools ?? SUB_AGENT_TOOLS`。
> 具体改在 `query()` 调用附近。改完后跑全量测试确认无回归。

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/zai-bridge-tools.test.ts
```

Expected: PASS

- [ ] **Step 5: 跑全量测试确认无回归**

```bash
bun run test
```

Expected: 现有 33 个测试文件 / ~100+ 测试全过。如有回归，说明 `BRIDGE_TOOLS` → `SUB_AGENT_TOOLS` 别名保留得不对，回头补。

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/zai-bridge.ts tests/unit/main/sdk/zai-bridge-tools.test.ts
git commit -m "feat(zai-bridge): runZaiQuery accepts additionalTools parameter"
```

---

### Task 3: 新增 3 个 prompt 模板（parent-system / parent-user / slide-generator）

**Files:**
- Create: `src/main/sdk/prompts/ppt-parent-system.ts`
- Create: `src/main/sdk/prompts/ppt-parent-user.ts`
- Create: `src/main/sdk/prompts/ppt-slide-generator.ts`
- Modify: `src/main/sdk/prompts/index.ts:13-21` — `PromptId` union 加 3 个
- Test: `tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts`（新建）

**Interfaces:**
- Produces: `PPT_PARENT_SYSTEM_PROMPT` 模板（父 agent system prompt，含 6 项验证标准）
- Produces: `PPT_PARENT_USER_PROMPT` 模板（父 agent user prompt，含 outline/intent/style/子 agent prompt 数组占位符）
- Produces: `PPT_SLIDE_GENERATOR_PROMPT` 模板（子 agent per-slide prompt，含自检规则）
- Guarantees: 父 agent prompt 不含 "输出 JSON" / "输出摘要" 字样（spec §"不要做"）

- [ ] **Step 1: 在 `PromptId` union 加 3 个 id**

修改 `src/main/sdk/prompts/types.ts:11-17`：

```ts
export type PromptId =
  | "OUTLINE_PROMPT"
  | "REGENERATE_PROMPT"
  | "SLIDE_SYSTEM_PROMPT"
  | "SLIDE_USER_PROMPT"
  | "INTENTION_PROMPT"
  | "PPT_PARENT_SYSTEM_PROMPT"
  | "PPT_PARENT_USER_PROMPT"
  | "PPT_SLIDE_GENERATOR_PROMPT";
```

- [ ] **Step 2: 写失败测试**

新建 `tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

import { renderPrompt } from "../../../../../src/main/sdk/prompts/index.js";

describe("PPT orchestrator prompts", () => {
  it("PPT_PARENT_SYSTEM_PROMPT renders without throwing", async () => {
    const out = await renderPrompt("PPT_PARENT_SYSTEM_PROMPT", {});
    // 关键约束：父 system prompt 严禁要求 JSON 摘要
    expect(out).not.toMatch(/输出\s*JSON/);
    expect(out).not.toMatch(/输出.*摘要/);
    // 6 项验证标准都应在
    expect(out).toMatch(/<section>/);
    expect(out).toMatch(/data-layout/);
    expect(out).toMatch(/200\s*字符/);
  });

  it("PPT_PARENT_USER_PROMPT renders with full context", async () => {
    const out = await renderPrompt("PPT_PARENT_USER_PROMPT", {
      outlineSummary: "30 slides",
      intentJson: { audience: "execs" },
      styleJson: { primaryColor: "#000" },
      slidesJson: [{ id: "s1", title: "T1", layout: 1 }],
      subAgentPromptsJson: [{ slideId: "s1", prompt: "..." }],
    });
    expect(out).toContain("30 slides");
    expect(out).toContain('"audience": "execs"');
    expect(out).toContain('"slideId": "s1"');
  });

  it("PPT_SLIDE_GENERATOR_PROMPT renders per-slide with neighbors", async () => {
    const out = await renderPrompt("PPT_SLIDE_GENERATOR_PROMPT", {
      slideId: "slide-3",
      title: "市场分析",
      bullets: ["TAM 100亿", "CAGR 12%"],
      notes: "",
      layout: "2",
      layoutDirection: "双栏卡片",
      neighborPaths: "slides/slide-2.html\nslides/slide-4.html",
      style: '{"primaryColor":"#FF6600"}',
    });
    expect(out).toContain("slide-3");
    expect(out).toContain("市场分析");
    expect(out).toContain("TAM 100亿");
    expect(out).toContain("slides/slide-2.html");
    expect(out).toContain("Read");
    expect(out).toContain("Write");
    expect(out).toMatch(/16\s*:\s*9|1280\s*×\s*720|960\s*×\s*540/);
  });
});
```

- [ ] **Step 3: 跑测试确认 RED**

```bash
bunx vitest run tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts
```

Expected: 3 个 test 全 FAIL（prompt id 未注册）。

- [ ] **Step 4: 创建 `ppt-parent-system.ts`**

新建 `src/main/sdk/prompts/ppt-parent-system.ts`：

```ts
import type { PromptSpec } from "./types.js";

export const pptParentSystemPrompt: PromptSpec = {
  id: "PPT_PARENT_SYSTEM_PROMPT",
  title: "PPT 编排父 agent 系统提示词",
  description:
    "发给父 agent 的 system prompt。让父 agent 并行派 N 个 general-purpose 子 agent，然后用 Read 工具逐一验证产出物。",
  defaultTemplate: `你是 PPT 编排 agent。任务：让 N 张 slide 的产出物 (slides/<id>.html) 全部通过你的质量验证。

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
prompt 里附具体反馈。例："邻居 slide 用了 #2563EB 主色，你这页用了 #DC2626，请统一为蓝色调"。

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
- description 必须含 slideId，方便后续 turn 识别通知`,
  variables: [],
};
```

- [ ] **Step 5: 创建 `ppt-parent-user.ts`**

新建 `src/main/sdk/prompts/ppt-parent-user.ts`：

```ts
import type { PromptSpec } from "./types.js";

export const pptParentUserPrompt: PromptSpec = {
  id: "PPT_PARENT_USER_PROMPT",
  title: "PPT 编排父 agent 用户提示词",
  description: "把 outline/intent/style + 预渲染的子 agent prompt 数组拼成一个 user message 给父 agent。",
  defaultTemplate: `## Outline 摘要
{{outlineSummary}}

## Intent（来自 intent.json）
{{intentJson}}

## Style（来自 style.json）
{{styleJson}}

## 待生成 slides
{{slidesJson}}

## 子 agent 指令（已预渲染，直接 dispatch，不要改）
{{subAgentPromptsJson}}

## 任务
对每张 slide 派发一个 Agent 工具调用（subagent_type=general-purpose,
run_in_background=true, description="Generate slide <slideId>",
prompt=上面数组里对应 slideId 的 prompt）。

第一轮 turn 全部一起发，不要分批。`,
  variables: [
    { name: "outlineSummary", description: "outline 摘要文本", type: "string" },
    { name: "intentJson", description: "intent.json 内容", type: "json" },
    { name: "styleJson", description: "style.json 内容", type: "json" },
    { name: "slidesJson", description: "待生成 slide 列表", type: "json" },
    { name: "subAgentPromptsJson", description: "预渲染的子 agent prompt 数组", type: "json" },
  ],
};
```

- [ ] **Step 6: 创建 `ppt-slide-generator.ts`**

新建 `src/main/sdk/prompts/ppt-slide-generator.ts`：

```ts
import type { PromptSpec } from "./types.js";

export const pptSlideGeneratorPrompt: PromptSpec = {
  id: "PPT_SLIDE_GENERATOR_PROMPT",
  title: "PPT slide 生成子 agent 用户提示词",
  description:
    "每张 slide 的子 agent user prompt。由主进程预渲染时填充 slideId / 标题 / 要点 / 邻居文件路径。",
  defaultTemplate: `你是单张 PPT slide 的生成 agent。

## 产出
1 个 HTML <section> 块，写到 slides/{{slideId}}.html

## 当前任务
- slideId: {{slideId}}
- title: {{title}}
- bullets:
{{bullets}}
- notes: {{notes}}
- layout: {{layout}}（视觉方向：{{layoutDirection}}）
- 邻居 slide 文件（用 Read 看风格一致性）:
{{neighborPaths}}
- 全局样式（主色 / 强调色 / 字体）: {{style}}

## 视觉规则
- 16:9 aspect ratio（960×540）
- 必须 inline style（不用 class）
- <section data-layout="N"> 包裹
- 五种 layout 视觉方向参考你读到的邻居 slide

## 工作流
1. Read 邻居 slide 文件了解风格一致性
2. Write 初始 HTML 到 slides/{{slideId}}.html
3. Read 自己刚写的文件
4. 自检：结构闭合、data-layout、关键元素齐全
5. 不通过 → Edit 工具修复（最多 3 轮自迭代）
6. 最后输出简短报告：完成 / 修改了 X 处 / 内容覆盖了 Y`,
  variables: [
    { name: "slideId", description: "slide id", type: "string" },
    { name: "title", description: "slide 标题", type: "string" },
    { name: "bullets", description: "slide 要点（多行字符串）", type: "string" },
    { name: "notes", description: "slide 备注", type: "string" },
    { name: "layout", description: "layout 编号 1-5", type: "string" },
    { name: "layoutDirection", description: "layout 视觉方向描述", type: "string" },
    { name: "neighborPaths", description: "邻居 slide 文件路径（多行）", type: "string" },
    { name: "style", description: "全局样式 JSON 字符串", type: "string" },
  ],
};
```

- [ ] **Step 7: 在 `prompts/index.ts` 注册**

修改 `src/main/sdk/prompts/index.ts` 末尾的 import + register 区（现状是 5 个 register 调用，逐行 import）。在末尾追加：

```ts
import { pptParentSystemPrompt } from "./ppt-parent-system.js";
registerPrompt(pptParentSystemPrompt);
import { pptParentUserPrompt } from "./ppt-parent-user.js";
registerPrompt(pptParentUserPrompt);
import { pptSlideGeneratorPrompt } from "./ppt-slide-generator.js";
registerPrompt(pptSlideGeneratorPrompt);
```

- [ ] **Step 8: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts
```

Expected: 3 个 test 全 PASS

- [ ] **Step 9: 跑 typecheck**

```bash
bun run typecheck
```

Expected: 通过

- [ ] **Step 10: Commit**

```bash
git add src/main/sdk/prompts/types.ts src/main/sdk/prompts/index.ts \
        src/main/sdk/prompts/ppt-parent-system.ts \
        src/main/sdk/prompts/ppt-parent-user.ts \
        src/main/sdk/prompts/ppt-slide-generator.ts \
        tests/unit/main/sdk/prompts/ppt-orchestrator-prompts.test.ts
git commit -m "feat(prompts): add parent agent and slide-generator prompt templates"
```

---

### Task 4: 重写 runOrchestrator —— phase 1（构建 prompts + 调 runZaiQuery）

**Files:**
- Modify: `src/main/sdk/ppt-orchestrator.ts`（重写整个文件）
- Test: `tests/unit/main/sdk/ppt-orchestrator.test.ts`（新建）

**Interfaces:**
- Produces: `runOrchestrator(opts)` 函数签名不变（保持向后兼容）
- Phase 1 行为：构建父子 agent prompt → 调 `runZaiQuery` 一次 → 监听 stream 把 `runtime.done` 事件转成最终结果（done / failed / total 暂用 outline 长度近似）
- Guarantees: 不再使用 `GenerationRunner`；不再使用 worker pool；不再写 `slides/<id>.html` 占位模板

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/main/sdk/ppt-orchestrator.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

// mock runZaiQuery，让它发出一个空 stream
const mockStream = vi.fn();
vi.mock("../../../../src/main/sdk/zai-bridge.js", () => ({
  runZaiQuery: (...args: unknown[]) => mockStream(...args),
  SUB_AGENT_TOOLS: [],
  PARENT_AGENT_TOOLS: [],
}));

import { runOrchestrator } from "../../../../src/main/sdk/ppt-orchestrator.js";

describe("runOrchestrator (sub-agent rewrite)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "orch-test-"));
    mockStream.mockReset();
  });

  it("calls runZaiQuery once with parent system prompt and per-slide sub prompts", async () => {
    async function* emptyStream() {
      // 立即发出 runtime.done 让 runOrchestrator 干净返回
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => emptyStream());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: {
        topic: "T",
        slides: [
          { id: "s1", title: "A", bullets: ["a"] },
          { id: "s2", title: "B", bullets: ["b"] },
        ],
      } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
    });

    expect(mockStream).toHaveBeenCalledTimes(1);
    const call = mockStream.mock.calls[0][0];
    // system prompt 必须含 6 项验证字样
    expect(call.systemPrompt).toMatch(/验证标准/);
    expect(call.systemPrompt).toMatch(/<section>/);
    // user prompt 必须含两份预渲染的子 agent prompt
    expect(call.prompt).toMatch(/slides\/s1\.html/);
    expect(call.prompt).toMatch(/slides\/s2\.html/);
    // 工具集必须是 PARENT
    expect(call.additionalTools).toBeDefined();
    expect(result.total).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
bunx vitest run tests/unit/main/sdk/ppt-orchestrator.test.ts
```

Expected: 编译或运行时 FAIL —— `runOrchestrator` 仍是 worker pool 实现，没调 `runZaiQuery`。

- [ ] **Step 3: 重写 `ppt-orchestrator.ts`**

完全重写 `src/main/sdk/ppt-orchestrator.ts`：

```ts
import type { Outline, Settings } from "../../shared/types.js";
import * as projectFs from "../fs/projects.js";
import { renderPrompt } from "./prompts/index.js";
import { LAYOUT_DIRECTIONS } from "./prompts/slide-user.js";
import { PARENT_AGENT_TOOLS, runZaiQuery } from "./zai-bridge.js";

export type SlideStatus = "pending" | "layout" | "generating" | "done" | "failed";

export interface OrchestratorSlide {
  id: string;
  title: string;
  status: SlideStatus;
  layout: 1 | 2 | 3 | 4 | 5;
  html?: string;
  error?: string;
  durationMs?: number;
  retries?: number;
}

export interface OrchestratorOptions {
  projectId: string;
  outline: Outline;
  settings: Settings;
  style?: unknown;
  cwd: string;
  concurrency?: number;
  maxRetries?: number;
  onSlideReady?: (slide: OrchestratorSlide) => void | Promise<void>;
  onProgress?: (info: {
    completed: number;
    total: number;
    slideId: string;
    status: SlideStatus;
  }) => void;
  signal?: AbortSignal;
}

export interface OrchestratorResult {
  completed: number;
  failed: number;
  total: number;
  cancelled: boolean;
}

function numericLayout(slide: { layout?: string }, index: number): 1 | 2 | 3 | 4 | 5 {
  if (slide.layout === "cover") return 1;
  if (slide.layout === "list") return 2;
  if (slide.layout === "columns") return 3;
  if (slide.layout === "stats") return 4;
  if (slide.layout === "quote" || slide.layout === "closing") return 5;
  return ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

interface SubAgentPrompt {
  slideId: string;
  prompt: string;
}

async function buildSubAgentPrompts(
  outline: Outline,
  style: unknown,
): Promise<SubAgentPrompt[]> {
  return Promise.all(
    outline.slides.map(async (s, i) => {
      const layout = numericLayout(s, i);
      const neighborIds = [
        outline.slides[i - 1]?.id,
        outline.slides[i + 1]?.id,
      ].filter(Boolean) as string[];
      const neighborPaths = neighborIds
        .map((id) => `slides/${id}.html`)
        .join("\n");
      const targetBullets = (s.bullets ?? [])
        .map((b, j) => `  ${j + 1}. ${b}`)
        .join("\n");
      const prompt = await renderPrompt("PPT_SLIDE_GENERATOR_PROMPT", {
        slideId: s.id,
        title: s.title,
        bullets: targetBullets,
        notes: s.notes ?? "",
        layout: layout.toString(),
        layoutDirection: LAYOUT_DIRECTIONS[layout - 1] ?? "",
        neighborPaths,
        style: style ? JSON.stringify(style) : "{}",
      });
      return { slideId: s.id, prompt };
    }),
  );
}

async function buildParentUserPrompt(
  outline: Outline,
  style: unknown,
  intent: unknown,
  subPrompts: SubAgentPrompt[],
): Promise<string> {
  const slidesJson = outline.slides.map((s, i) => ({
    id: s.id,
    title: s.title,
    layout: numericLayout(s, i),
  }));
  return renderPrompt("PPT_PARENT_USER_PROMPT", {
    outlineSummary: outline.slides.map((s) => `- ${s.title}`).join("\n"),
    intentJson: intent ?? {},
    styleJson: style ?? {},
    slidesJson,
    subAgentPromptsJson: subPrompts,
  });
}

/**
 * 阶段 1 重写：用父 agent + N 个 general-purpose 子 agent 替换 worker pool。
 * 本任务只实现"调 runZaiQuery + 收 runtime.done"的最小组件；
 * 事件桥接（subagent:start / subagent:done → renderer 广播）在 Task 5 加入。
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const total = opts.outline.slides.length;

  // Step 1: 写 framework HTML（保留旧行为，让 renderer 立即能 fetch）
  const frameworkHtml = `<!DOCTYPE html><html><head><title>${opts.outline.slides[0]?.title ?? "Presentation"}</title></head><body><main id="slides"></main></body></html>`;
  await projectFs.writeProjectFramework(opts.projectId, frameworkHtml);

  // Step 2: 构建父子 prompt
  const subPrompts = await buildSubAgentPrompts(opts.outline, opts.style);
  const parentUserPrompt = await buildParentUserPrompt(
    opts.outline,
    opts.style,
    null,
    subPrompts,
  );

  // Step 3: 调一次 runZaiQuery，启动父 agent
  const parentSystemPrompt = await renderPrompt("PPT_PARENT_SYSTEM_PROMPT", {});
  const stream = runZaiQuery({
    prompt: parentUserPrompt,
    cwd: opts.cwd,
    model: opts.settings.llm.model,
    systemPrompt: parentSystemPrompt,
    maxTurns: 50,
    baseUrl: opts.settings.llm.baseUrl,
    apiKey: opts.settings.llm.apiKey,
    additionalTools: PARENT_AGENT_TOOLS,
  });

  // Step 4 (阶段 1 占位): 监听 stream 直到 runtime.done / runtime.error / runtime.aborted
  let cancelled = false;
  let completed = 0;
  let failed = 0;
  try {
    for await (const ev of stream) {
      if (opts.signal?.aborted) {
        cancelled = true;
        break;
      }
      const t = (ev as { type: string }).type;
      if (t === "runtime.done" || t === "runtime.error") break;
      if (t === "runtime.aborted") {
        cancelled = true;
        break;
      }
    }
  } catch {
    // runZaiQuery 抛错时视为失败
    failed = total;
  }

  // 阶段 1：completed/failed 由 Task 5 的事件桥提供精确计数；这里占位为 0
  return { completed, failed, total, cancelled };
}
```

> 注：本任务产出的 `runOrchestrator` 故意最小化（不写占位、不桥事件），
> Task 5 会在它上面叠加事件桥。Task 4 完成后能跑通"启动父 agent → 等 runtime.done → 返回"。
> 阶段 1 的 completed/failed 都为 0 是已知中间态，Task 5 会修正。

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/ppt-orchestrator.test.ts
```

Expected: PASS

- [ ] **Step 5: 跑 typecheck**

```bash
bun run typecheck
```

Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/main/sdk/ppt-orchestrator.ts tests/unit/main/sdk/ppt-orchestrator.test.ts
git commit -m "refactor(orchestrator): phase 1 - delegate to parent agent via runZaiQuery"
```

---

### Task 5: runOrchestrator 事件桥 —— subagent:start / done + runtime.* → renderer 广播

**Files:**
- Modify: `src/main/sdk/ppt-orchestrator.ts`（在 Task 4 基础上加事件桥）
- Test: `tests/unit/main/sdk/ppt-orchestrator.test.ts`（追加）

**Interfaces:**
- Produces: `onSlideReady` 回调被正确调用（status: layout / done / failed）
- Produces: `onProgress` 回调被正确调用
- Produces: `STAGE_HTML_SLIDE_READY` 等价 payload 通过回调传出
- Guarantees: dispatchCount 防 flicker —— 同 slideId 第二次 subagent:start 不触发 layout 回调
- Guarantees: subagent:done 时读 `slides/<id>.html` —— 文件存在 → done + html；不存在 → failed + error
- Guarantees: runtime.done / error / aborted 三种终止事件都触发 final 结果返回

- [ ] **Step 1: 追加失败测试**

在 `tests/unit/main/sdk/ppt-orchestrator.test.ts` 末尾追加：

```ts
describe("runOrchestrator event bridge", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "orch-evt-"));
    mockStream.mockReset();
  });

  it("subagent:start first time triggers layout, second time does not (no flicker)", async () => {
    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:start", subSessionId: "u2", description: "Generate slide s1" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Layouts = readyEvents.filter((e) => e.id === "s1" && e.status === "layout");
    expect(s1Layouts).toHaveLength(1);  // 第二次 start 不广播
  });

  it("subagent:done + html file exists → done with html", async () => {
    writeFileSync(join(tmp, "slides"), "");
    // 实际写 slides/s1.html
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(tmp, "slides"), { recursive: true });
    writeFileSync(join(tmp, "slides/s1.html"), "<section data-layout='1'>ok</section>");

    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "completed", output: "" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Done = readyEvents.find((e) => e.id === "s1" && e.status === "done");
    expect(s1Done).toBeDefined();
    expect(s1Done.html).toContain("<section");
    expect(result.completed).toBe(1);
  });

  it("subagent:done + html missing → failed with error", async () => {
    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "error", output: "boom" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Failed = readyEvents.find((e) => e.id === "s1" && e.status === "failed");
    expect(s1Failed).toBeDefined();
    expect(s1Failed.error).toContain("boom");
    expect(result.failed).toBe(1);
  });

  it("runtime.aborted → cancelled=true in result", async () => {
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "runtime.aborted" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
    });
    expect(result.cancelled).toBe(true);
  });

  it("runtime.error → remaining slides counted as failed", async () => {
    async function* s() {
      // s1 done, s2 没机会开始
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "completed", output: "" };
      yield { type: "runtime.error", error: "max_turns" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }, { id: "s2", title: "B" }] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmp,
    });
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1); // s2 没机会完成 → failed
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
bunx vitest run tests/unit/main/sdk/ppt-orchestrator.test.ts
```

Expected: 5 个新 test 全 FAIL（事件桥未实现）。

- [ ] **Step 3: 在 runOrchestrator 内加事件桥**

修改 `src/main/sdk/ppt-orchestrator.ts` 的 `runOrchestrator` 函数。替换 Task 4 写的
try { for await } 循环为：

```ts
  // Step 4: 事件桥 —— 把父 stream 的事件转成 onSlideReady 回调
  const slideState = new Map<string, {
    status: SlideStatus;
    html?: string;
    error?: string;
    dispatchCount: number;
  }>();
  const subToSlide = new Map<string, string>();
  let cancelled = false;
  let runtimeDone = false;

  const parseSlideId = (desc?: string): string | null => {
    const m = desc?.match(/Generate slide (\S+)/);
    return m ? m[1] : null;
  };

  try {
    for await (const ev of stream) {
      const t = (ev as { type: string }).type;
      if (t === "subagent:start") {
        const e = ev as { subSessionId: string; description?: string };
        const slideId = parseSlideId(e.description);
        if (!slideId) continue;
        subToSlide.set(e.subSessionId, slideId);
        const s = slideState.get(slideId) ?? { status: "pending", dispatchCount: 0 };
        s.dispatchCount++;
        if (s.dispatchCount === 1) {
          s.status = "layout";
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId,
            title: slideId,
            status: "layout",
            layout: numericLayout(
              opts.outline.slides.find((x) => x.id === slideId) ?? {},
              0,
            ),
          });
          opts.onProgress?.({ completed: 0, total, slideId, status: "layout" });
        }
      } else if (t === "subagent:done") {
        const e = ev as { subSessionId: string; exitReason?: string; output?: string };
        const slideId = subToSlide.get(e.subSessionId);
        if (!slideId) continue;
        const layout = numericLayout(
          opts.outline.slides.find((x) => x.id === slideId) ?? {},
          0,
        );
        let html: string | null = null;
        try {
          const fs = await import("node:fs/promises");
          html = await fs.readFile(`${opts.cwd}/slides/${slideId}.html`, "utf8");
        } catch {
          html = null;
        }
        const s = slideState.get(slideId) ?? { status: "pending", dispatchCount: 1 };
        if (e.exitReason === "completed" && html) {
          s.status = "done";
          s.html = html;
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId, title: slideId, status: "done", layout, html,
          });
        } else {
          s.status = "failed";
          s.error = e.output ?? `exitReason=${e.exitReason}`;
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId, title: slideId, status: "failed", layout, error: s.error,
          });
        }
      } else if (t === "runtime.done" || t === "runtime.error") {
        runtimeDone = true;
        break;
      } else if (t === "runtime.aborted") {
        cancelled = true;
        break;
      }
    }
  } catch {
    // runZaiQuery 抛错 → 后续 fallback 把所有 slide 标 failed
  }

  if (opts.signal?.aborted) cancelled = true;

  // 统计完成 / 失败
  let completed = 0;
  let failed = 0;
  for (const slideId of opts.outline.slides.map((s) => s.id)) {
    const s = slideState.get(slideId);
    if (s?.status === "done") completed++;
    else if (s?.status === "failed") failed++;
    else if (!cancelled && runtimeDone) failed++; // runtime 终止但 slide 没动 → failed
  }

  return { completed, failed, total, cancelled };
}
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/ppt-orchestrator.test.ts
```

Expected: 5 个新 test 全 PASS

- [ ] **Step 5: 跑全量测试确认无回归**

```bash
bun run test
```

Expected: 全部通过（包括旧的 GenerationRunner / outline 测试）

- [ ] **Step 6: 跑 typecheck**

```bash
bun run typecheck
```

Expected: 通过

- [ ] **Step 7: Commit**

```bash
git add src/main/sdk/ppt-orchestrator.ts tests/unit/main/sdk/ppt-orchestrator.test.ts
git commit -m "feat(orchestrator): event bridge for subagent start/done + runtime.*"
```

---

### Task 6: 端到端 smoke test —— 真实 runZaiQuery 跑一次空 outline

**Files:**
- Test: `tests/unit/main/sdk/ppt-orchestrator.test.ts`（追加一个真 stream 的 smoke test）

**Goal:** 验证 Task 1-5 集成后，整条管道能跑通（虽然流里没真 LLM 响应）。

- [ ] **Step 1: 加 smoke test**

在 `tests/unit/main/sdk/ppt-orchestrator.test.ts` 末尾追加：

```ts
describe("runOrchestrator end-to-end smoke", () => {
  it("integrates prompt building + runZaiQuery call without throwing on minimal input", async () => {
    async function* empty() {
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => empty());

    // outline 0 slides 时也要安全返回
    const result = await runOrchestrator({
      projectId: "p-empty",
      outline: { topic: "T", slides: [] } as any,
      settings: { llm: { baseUrl: "x", apiKey: "y", model: "m" } } as any,
      cwd: tmpdir(),
    });
    expect(result.total).toBe(0);
    expect(result.cancelled).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认 GREEN**

```bash
bunx vitest run tests/unit/main/sdk/ppt-orchestrator.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/main/sdk/ppt-orchestrator.test.ts
git commit -m "test(orchestrator): smoke test for empty outline"
```

---

### Task 7: e2e cancel 测试 —— 验证 BackgroundRuntime abortSignal 传播

**Files:**
- Create: `tests/e2e/ppt-subagent-cancel.spec.ts`

**Goal:** 验证用户取消生成时，BackgroundRuntime 派的子 agent 是否真的被中止（Open Question 1）。

- [ ] **Step 1: 写 e2e 测试**

新建 `tests/e2e/ppt-subagent-cancel.spec.ts`：

```ts
import { test, expect } from "@playwright/test";

test.describe("PPT sub-agent cancel propagation", () => {
  test("cancel during sub-agent generation finishes within 10s with cancelled=true", async ({ page }) => {
    // 进 workbench，新建任务，跑 outline → generation
    // 5 秒后点击 "取消生成"
    // 断言 STAGE_HTML_GENERATE_DONE 广播 10 秒内到达且 cancelled=true
    // （具体触发步骤参考现有 tests/e2e/outline-build-no-stuck.spec.ts 的模式）

    test.skip(true, "等真实 LLM 环境跑通后再启用；本地 mock 测不到 BackgroundRuntime 真实行为");
  });
});
```

> 标注 skip 是因为 e2e 测试需要真实 LLM + BackgroundRuntime，CI 环境跑不动。
> 真实跑：开发机上手动开 Electron，触发 generation，5 秒后点取消，观察 DevTools console
> 看 STAGE_HTML_GENERATE_DONE 何时到达、是否 cancelled=true。
> 把结果填进这个 e2e 文件，决定是否要 backport 修复。

- [ ] **Step 2: 跑 e2e 确认状态**

```bash
bun run e2e -- tests/e2e/ppt-subagent-cancel.spec.ts
```

Expected: 1 skipped, 0 failed

- [ ] **Step 3: Commit（e2e 框架就位 + skip marker）**

```bash
git add tests/e2e/ppt-subagent-cancel.spec.ts
git commit -m "test(e2e): placeholder for sub-agent cancel propagation check"
```

---

### Task 8: 主进程 bundle 重建 + 真实 Electron 验证

**Files:**
- No file changes

**Goal:** 主进程代码改了，必须 `bun run build:main` + 完全重启 Electron 验证（AGENTS.md "改 src/main/**" 流程）。

- [ ] **Step 1: 重建主进程 bundle**

```bash
bun run build:main
```

Expected: 输出 `dist/main/index.js` 重新生成

- [ ] **Step 2: 跑全量 typecheck + test 确认最终状态干净**

```bash
bun run typecheck
bun run test
```

Expected: 全过

- [ ] **Step 3: 完全退出 Electron**

用户操作：Cmd+Q（macOS）完整退出 Electron 应用（不是 Cmd+R renderer reload）。

- [ ] **Step 4: 重启 Electron**

```bash
bun run dev
```

Expected: Electron 启动正常，无主进程启动错误

- [ ] **Step 5: 现有项目跑一次完整 outline → generation 流程**

用户操作：
1. 打开一个已有的 outline + intent 已完成的 PPT 项目
2. 点 "重新生成" 触发新流水线（intent → outline re-run → 子 agent 并行生成）
3. 观察：
   - DevTools console：`STAGE_HTML_SLIDE_READY` 事件应几乎同时大量出现（真并行）
   - 渲染进度条快速推进
   - 最终 `STAGE_HTML_GENERATE_DONE` 含合理 completed/failed 比例
4. 看 dist/main/index.js bundle 大小（应该比改前略小，因为删了 worker pool）

- [ ] **Step 6: 关闭 Electron，整理 commit 历史**

```bash
git log --oneline -10
```

检查：应该有 7-8 个 commit，按 Task 顺序排列。如有需要，squash 无关紧要的中间 commit。

---

## Verification Checklist（实施完毕后逐项核对）

- [ ] 父 agent 第一轮 turn 同时发出 N 个 Agent 调用（DevTools → Network 看 Messages stream）
- [ ] BackgroundRuntime 派的子 agent 用 Write 工具写 `slides/<id>.html`（在项目目录 `ls slides/`）
- [ ] 父 agent 用 Read 工具读邻居 slide（DevTools → Network 看 Read tool call）
- [ ] 父 agent 在验证不通过时派 retry（DevTools console 看第二次 Agent call）
- [ ] 取消生成后 `STAGE_HTML_GENERATE_DONE` 5 秒内到达且 cancelled=true（手动测）
- [ ] renderer 不感知改动：现有 projectDetail / pptGeneration / workbench store 测试全过
- [ ] `ppt-orchestrator.ts` 行数从 271 → ~200（删了 worker pool；多了事件桥；净减少）
- [ ] `bun run typecheck` 干净
- [ ] `bun run test` 全过（33 个测试文件 / 100+ 测试 + 新增 9 个）

## Open Questions（实施时确认）

1. **BackgroundRuntime abortSignal 传播**：Task 7 的 e2e 测试在真实环境下验证。
   如果子 agent 不响应 abort → 用户取消后等几秒看到 done → 接受为 known limitation，
   在 README / docs 注明。

## Rollback

回滚 = `git revert <merge-commit>` + `bun run build:main`。IPC 协议 0 改动，
renderer 不感知，回滚后用户无感。
