# zn-agentic-ppt

桌面端 AI 演示文稿生成器。基于 Electron + React + Antd，通过 vendored 的 LLM Agent SDK 把用户给的主题 + 大纲转成 HTML PPT。

## 快速开始

```bash
pnpm install
pnpm run dev          # vite + tsc --watch + electron
```

## 首次使用

1. 打开应用 → 设置页 → 配置 LLM（base URL、API key、模型）
2. 欢迎页 → 新建项目 → 输主题
3. 编辑器 → 写大纲（# = 一页）→ 点 "⚡ 生成 PPT"
4. 预览生成结果 → 导出 HTML

## 数据目录

所有数据存在 `~/.zn-agentic-ppt/`：
- `settings.json` — LLM 配置
- `projects/<uuid>/` — 每个项目一个目录
- `logs/` — main 进程日志
- `cache/` — 模型列表缓存

## 同步 SDK

上游 SDK 变更后：
```bash
cd /Users/ethan/code/opencc-worktree && bun run build
cd /Users/ethan/code/zn-agentic-ppt && pnpm run sync-sdk
```

## 开发

```bash
pnpm run typecheck    # tsc --noEmit × 2
pnpm test             # vitest
pnpm run e2e          # playwright
pnpm run build        # esbuild + vite
```
