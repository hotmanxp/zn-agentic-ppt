# 提示词统一管理重构设计

**日期**: 2026-06-19
**目标**: 把分散在各文件的 agent 提示词统一管理，并在 settings UI 支持自定义覆盖。

---

## 1. 背景

当前提示词散落在 4 个文件：
- `src/main/sdk/prompts.ts` — legacy `buildSystemPrompt(topic, outline)`
- `src/main/sdk/outline-prompt.ts` — `buildOutlinePrompt(topic, source)`
- `src/main/sdk/regenerate-prompt.ts` — `buildRegeneratePrompt(target, others, currentSectionHtml, layout?)`
- `src/main/sdk/ppt-framework.ts` — `buildSystemPrompt(ctx)` + `PPT_SYSTEM_RULES` + `buildSlidePrompt(target, others, ctx)` + `LAYOUT_VISUAL_DIRECTIONS`

调用方无法在不重新编译的情况下调整提示词；LLM 行为调整需要改源码。

---

## 2. 目标

1. **统一管理**：4 个提示词每个导出 `PromptSpec`（id + title + description + defaultTemplate + variables），通过 `src/main/sdk/prompts/index.ts` 中央索引
2. **运行时覆盖**：settings.json 加 `prompts: Record<id, string | null>` 字段，渲染时优先用覆盖值
3. **模板变量**：`{{name}}` Mustache 语法，支持 string + json 两种变量类型
4. **设置 UI**：Settings 页加「📝 提示词」tab，4 个编辑器 + 「重置为默认」按钮

---

## 3. 架构

### 3.1 类型定义

`src/main/sdk/prompts/types.ts`：

```ts
export type PromptVarType = 'string' | 'json'

export interface PromptVar {
  name: string
  description: string
  type: PromptVarType
  /** 仅展示用：示例路径或示例值（不参与渲染） */
  example?: string
}

export interface PromptSpec {
  id: 'outline' | 'regenerate' | 'slide-system' | 'slide-user'
  title: string
  description: string
  defaultTemplate: string
  variables: PromptVar[]
}
```

### 3.2 4 个 PromptSpec 文件

每个文件导出一个常量：

```ts
// src/main/sdk/prompts/outline.ts
export const outlinePrompt: PromptSpec = {
  id: 'outline',
  title: '大纲生成',
  description: '生成 4-8 张幻灯片大纲，cover/closing 强制首尾',
  defaultTemplate: `你是 PPT 大纲编辑 + 视觉策划...{{topic}}...{{source}}...`,
  variables: [
    { name: 'topic', description: '用户主题', type: 'string' },
    { name: 'source', description: '用户原始内容', type: 'string' },
  ],
}
```

同样模式：`regenerate.ts` / `slide-system.ts` / `slide-user.ts`。

### 3.3 中央索引

`src/main/sdk/prompts/index.ts`：

```ts
import { outlinePrompt } from './outline.js'
import { regeneratePrompt } from './regenerate.js'
import { slideSystemPrompt } from './slide-system.js'
import { slideUserPrompt } from './slide-user.js'
import * as settingsFs from '../../main/fs/settings.js'

export const PROMPT_SPECS = [outlinePrompt, regeneratePrompt, slideSystemPrompt, slideUserPrompt]

export function getSpec(id: string): PromptSpec | null {
  return PROMPT_SPECS.find(s => s.id === id) ?? null
}

export function renderPrompt(id: string, vars: Record<string, unknown>): string {
  const spec = getSpec(id)
  if (!spec) throw new Error(`未知 prompt id: ${id}`)
  const override = settingsFs.getPromptOverride(id)
  const template = override ?? spec.defaultTemplate
  return fillTemplate(template, vars, spec.variables)
}

export function fillTemplate(
  template: string,
  vars: Record<string, unknown>,
  spec: PromptVar[],
): string {
  // 匹配 {{name}} 模式（非贪婪，name 是 [a-zA-Z_][a-zA-Z0-9_.]*）
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (match, name: string) => {
    const v = spec.find(s => s.name === name)
    if (!v) throw new Error(`模板引用了未声明变量: ${match}`)
    if (!(name in vars)) throw new Error(`渲染变量 ${name} 缺值（prompt id 应在调用方传入）`)
    const val = vars[name]
    if (v.type === 'json') return JSON.stringify(val, null, 2)
    return String(val)
  })
}
```

### 3.4 调用点改造

| 原 | 新 |
|---|---|
| `stage.ts`: `buildOutlinePrompt(topic, source)` | `renderPrompt('outline', { topic, source })` |
| `stage.ts`: `buildRegeneratePrompt(target, others, currentSectionHtml, layout)` | `renderPrompt('regenerate', { target, others, currentSectionHtml, layout })` |
| `ppt-orchestrator.ts`: `buildSystemPrompt(ctx)` + `buildSlidePrompt(target, others, ctx)` | `renderPrompt('slide-system', { globalStyle: ctx.globalStyle })` + `renderPrompt('slide-user', { target, others, cwd, slideIndex, totalSlides, layout, style: ctx.style })` |

`ppt-framework.ts` 删除 `buildSystemPrompt` / `PPT_SYSTEM_RULES` / `buildSlidePrompt` / `LAYOUT_VISUAL_DIRECTIONS`；改为 re-export `renderPrompt` 给可能的旧调用方（薄包装）。

---

## 4. 组件 / 文件清单

### 4.1 新增 (8)

| 文件 | 作用 |
|---|---|
| `src/main/sdk/prompts/types.ts` | PromptSpec / PromptVar 类型 |
| `src/main/sdk/prompts/outline.ts` | 大纲 prompt spec |
| `src/main/sdk/prompts/regenerate.ts` | 重新生成 prompt spec |
| `src/main/sdk/prompts/slide-system.ts` | 单页系统 prompt spec |
| `src/main/sdk/prompts/slide-user.ts` | 单页用户 prompt spec |
| `src/main/sdk/prompts/index.ts` | 中央注册表 + renderPrompt + fillTemplate |
| `src/renderer/components/PromptEditor.tsx` | 单提示词编辑器 |
| `src/renderer/components/PromptSettings.tsx` | 提示词 tab 内容（4 个 PromptEditor） |

### 4.2 修改 (7)

| 文件 | 变更 |
|---|---|
| `src/shared/types.ts` | `Settings` 加 `prompts: Record<string, string \| null>` |
| `src/main/fs/settings.ts` | CRUD：`getPromptOverride` / `setPromptOverride` / `resetPromptOverride` / `listPromptOverrides` |
| `src/main/ipc/settings.ts` | 4 个 IPC handler |
| `src/shared/ipc-channels.ts` | 4 个 `SETTINGS_PROMPT_*` 常量 |
| `src/renderer/lib/api.ts` | `BridgeApi.settings.prompts.{get,set,reset,list}` |
| `src/main/sdk/ppt-framework.ts` | 删 4 个函数；保留 re-export renderPrompt 薄包装 |
| `src/renderer/routes/Settings.tsx` | 侧栏 tab + 切换 |

### 4.3 删除 (2)

| 文件 | 原因 |
|---|---|
| `src/main/sdk/outline-prompt.ts` | 逻辑搬到 `prompts/outline.ts` |
| `src/main/sdk/regenerate-prompt.ts` | 逻辑搬到 `prompts/regenerate.ts` |

### 4.4 总改动

15 文件（新增 8 + 修改 7）。超出 memory 的 ≤3 限制，但提示词分散在 4 个文件，统一到中央索引必须经过所有调用点。建议：

1. 底层先做：types.ts → 4 个 spec → index.ts + fillTemplate
2. 替换调用点：ppt-framework.ts 薄包装 → stage.ts → ppt-orchestrator.ts
3. 删旧文件
4. settings fs + IPC + renderer UI

---

## 5. 数据流

### 5.1 冷启动

```
App mount → settings.load() → 拿到 settings（含 prompts map）
用户操作 → 调用方 → renderPrompt(id, vars)
  → getSpec(id) → PROMPT_SPECS 查表
  → settingsFs.getPromptOverride(id) → 有则用覆盖，否则 defaultTemplate
  → fillTemplate(template, vars, spec.variables)
  → 返回最终字符串 → 传给 SDK runner
```

### 5.2 用户编辑

```
Settings UI 点「📝 提示词」tab
  → PromptSettings 列出 4 个 spec（getSpecList via IPC）
  → 用户选一个 → PromptEditor 渲染
    → 读 settings.prompts[id]（覆盖值）或 spec.defaultTemplate
    → 编辑 → 本地 useState dirty
  → 「保存」→ settings.prompts[id] = text → settings.set(whole) → IPC
  → 「重置为默认」→ confirm → settings.prompts[id] = null → settings.set(whole)
```

### 5.3 关键不变量

- `PromptSpec.defaultTemplate` 是代码内置只读基线
- `settings.prompts[id] = null` 表示「用默认」
- `renderPrompt` 是 single source of truth — 调用方不应直接读模板
- 模板变量声明在 spec.variables，未声明的变量名抛错（防止 typo）

---

## 6. 错误处理

| 失败 | 行为 |
|---|---|
| 未知 prompt id | `renderPrompt` throw「未知 prompt: ${id}」 |
| 模板引用未声明变量 | throw「模板引用了未声明变量: {{foo}}」 |
| 调用方漏传变量 | throw「渲染 ${id} 缺变量: ${varName}」 |
| settings 保存失败 | toast.error，保留本地 draft |
| 重置时本地有未保存 | antd `Modal.confirm` 二次确认 |
| 模板解析异常（未闭合 `{{`） | 退回 defaultTemplate + console.warn |

---

## 7. 测试

| 测试 | 文件 |
|---|---|
| `fillTemplate`：string + json 替换 + 缺变量抛错 + 未声明抛错 | `tests/unit/main/sdk/prompts/fillTemplate.test.ts` |
| `renderPrompt`：override vs default + 未知 id 抛错 | `tests/unit/main/sdk/prompts/renderPrompt.test.ts` |
| settings fs：CRUD + null 删除覆盖 | `tests/unit/main/fs/settings.test.ts`（追加 case） |
| PromptEditor UI：reset 流（模块 mock） | `tests/unit/renderer/components/PromptEditor.test.tsx` |

E2E 不新增。

---

## 8. 风险

- **`ppt-framework.ts` 删除函数可能影响外部 import**：先 re-export renderPrompt 薄包装，下个 PR 再清理
- **`renderPrompt` 是同步 IO**（读 settings fs）：如果 settings 文件损坏会抛错；调用方需 try/catch 或接受默认值
- **覆盖模板可能让 LLM 行为失控**：在 settings UI 文案里强调「修改后效果不可预期，可重置回默认」

---

## 9. 实施顺序

1. `types.ts` + 4 个 spec 文件 + index.ts + fillTemplate + 单测
2. `settings fs` 加 prompt CRUD + IPC + 单测
3. 替换 stage.ts 调用 + 删 outline-prompt.ts / regenerate-prompt.ts
4. 替换 ppt-orchestrator.ts 调用 + ppt-framework.ts 薄包装
5. renderer lib/api.ts 加 prompts IPC + Settings UI 改造 + PromptEditor/PromptSettings
6. typecheck + build:main + 全量 test