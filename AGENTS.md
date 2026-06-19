# AGENTS.md — zn-agentic-ppt

**项目**：中文 AI PPT 生成器（Electron + React + Vite + Bun）
**栈**：TypeScript · Bun · Electron · React · Vite · antd · Zustand

---

## 关键架构

**渲染层**（`src/renderer/`）：React + Zustand store。Vite dev server 在 `:5173`。

**主进程**（`src/main/`）：Electron main。直接调用 Anthropic SDK（`vendor/sdk.mjs`）生成 slide HTML。

**PPT 生成调用链**：
```
GeneratePage 自动调用 / 「重新生成」按钮
  → pptGen.start(id)                    [renderer store]
  → api.stage.htmlGenerate(id)          [IPC]
  → stage.ts runOrchestrator({...})     [main]
  → runSingleSlide({systemPrompt, userMessage})
  → GenerationRunner.run()
  → sdkQuery({prompt, options:{cwd, model, systemPrompt, ...}})
  → SDK agent 用 Read/Write 工具编辑 slides/<id>.html
  → 主进程读回文件，broadcast STAGE_HTML_SLIDE_READY
  → renderer 收到，store 更新，SlidePreview 实时渲染
```

---

## ⚠️ 后端代码改了必须**重新构建 + 重启**

主进程是 esbuild 打包成 `dist/main/index.js` 单文件（package.json `"main"`）。**改了 `src/main/**` 任何文件，必须**：

```bash
bun run build:main      # 重建主进程 bundle
# 然后完全退出 Electron（Cmd+Q），再启动：
bun run dev             # 或 bun run start
```

**Vite HMR 不会自动重建主进程**，只对 renderer 生效。`tsc --noEmit --watch` 只做类型检查，不做 build。

只重启 renderer（Cmd+R）**不够**——主进程还是旧代码。

---

## PPT Wizard 用户旅程

```
Welcome → ProjectEditor → CollectEditor → OutlineEditor
                                              ↓ onNext (大纲 OK)
                                          GeneratePage  ← ← 自动开跑 LLM
                                              ↓ 完成后用户手动操作
                                          ProjectEditor (回到项目列表)
```

**注意**：当前 OutlinePage 的 `onNext` 跳到 `/generate`（不是 `/fine-tune`）。`GeneratePage` 内嵌 SlideThumbnailStrip + SlidePreview，完成后**不**自动跳页，用户在 GeneratePage 里继续操作（重新生成 / 单页重生成 / 选择大纲再编辑）。

`/fine-tune` 路由还在，但当前 wizard 不直接跳过去。

---

## 常用命令

| 命令 | 作用 |
|------|------|
| `bun run typecheck` | 跑两套 tsc（main + renderer），不能有错 |
| `bun run test` | vitest，12 文件 / 101 测试（2026-06-19） |
| `bun run build:main` | 重建主进程 bundle（改了 src/main/** 后必跑）|
| `bun run build` | 主进程 + renderer 一起构建 |
| `bun run dev` | vite + tsc watch + electron（开发用）|
| `bun run start` | electron .（跑已构建的 dist）|
| `bun run e2e` | Playwright e2e |

---

## 改动时的影响范围

| 改了哪里 | 需要做什么 |
|---------|----------|
| `src/main/**` | `bun run build:main` + 完全重启 Electron |
| `src/renderer/**` | Vite HMR 自动生效（无须重启）|
| `src/shared/**` | `bun run build:main`（被 main 引用）+ 视情况重启 renderer |
| `vendor/sdk.mjs` | 不要手改；`bun run sync-sdk` 拉上游 |
| `package.json` | 重新安装依赖 |

---

## 关键文件

- `src/main/sdk/runner.ts` — GenerationRunner，调 SDK
- `src/main/sdk/ppt-orchestrator.ts` — 多 slide 并发（worker pool，concurrency=3）
- `src/main/sdk/ppt-framework.ts` — `buildSlidePrompt` + `PPT_SYSTEM_RULES` + 5 种 layout 视觉方向
- `src/main/ipc/stage.ts` — IPC handler + STAGE_HTML_SLIDE_READY 广播（含 `layout` 字段）
- `src/renderer/stores/pptGeneration.ts` — PptSlide 含 `layout: 1\|2\|3\|4\|5`，按 index 轮换
- `src/renderer/components/SlidePreview.tsx` — 5 套 `.layout-N` CSS，让裸 HTML 也好看

---

## 风格规则

- `const` > `let`；用早期返回避免 `else`
- 单单词命名优先；避免不必要解构
- 用 `Bun.file()` / `Bun.write()` 等 Bun API
- 主进程改动控制在最小文件数（≤ 3 个）；改完立刻 typecheck + test
- 不在提示词里塞复杂 HTML 模板（LLM 会抄错）；用视觉方向描述 + CSS 兜底

---

## 反模式（已踩过的坑）

1. ❌ `sdkQuery(message, options)` 位置参数 → SDK 单参数 `params = {prompt, options}`，位置调用会丢参数
2. ❌ 提示词里给 LLM 一个 50 行 HTML 模板 → LLM 复制会改坏结构。改用简单 `<section><h1><ul><p>` 壳子 + CSS 兜底
3. ❌ 提示词写"不要加 inline style" → LLM 输出裸 HTML。改写"必须加 inline style" + 自检要求
4. ❌ 默认 userMessage 引用不存在的 `mcp__slides__write_slide_file` 工具 → 改成 Read + Write
5. ❌ 提示词全塞 systemPrompt → 通用规则进 `PPT_SYSTEM_RULES`，单页任务进 `buildSlidePrompt(userMessage)`
6. ❌ 初始占位模板用 `div.slide-title / ul.slide-bullets` 旧结构 → 改成跟 LLM 一致的 `<h1><ul><p>` 外壳（再清空成 `<section></section>`）
