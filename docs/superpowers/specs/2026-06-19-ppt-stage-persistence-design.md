# PPT 阶段持久化重构设计

**日期**: 2026-06-19
**目标**: 重构项目详情接口，让每个阶段的数据保存独立化，下次进入项目能完整恢复到 store。

---

## 1. 背景

当前每个阶段都有磁盘文件（`source.txt` / `outline.json` / `style.json` / `slides/*.html`），但：

- `project:get` 只返回 `meta + html`（旧合并字段），不返回 source、structured outline、style、单页 HTML
- `CollectEditor` 重进项目时不恢复 `source`，仅恢复 topic；「下一步」隐式调保存
- `OutlinePage` 用 500ms 防抖自动保存，无显式按钮
- `GeneratePage` 进入即调 LLM，**不读盘上已有 slides**，会触发 `clearProjectSlides` 把已有结果清空
- `useOutlineStore.load()` 是 bug 实现（只 `set({loaded:true})`）

---

## 2. 目标

1. **接口丰富化**：`project:detail` 一次返回所有阶段数据
2. **保存显式化**：三个阶段页面都加显式「保存」按钮；输入是草稿，不自动落盘
3. **恢复完整化**：进入项目路由一次性拉取，派发到各 store；阶段页面 mount 即看到上次状态
4. **保护已有成果**：GeneratePage 不再自动 start；用户必须显式点「重新生成」

---

## 3. 架构

### 3.1 主进程

`fs/projects.ts:getProject(id)` 扩展为多文件合并读取：

```
读取顺序（任一独立 try/catch）：
  meta.json     → ProjectMeta
  source.txt    → string | null
  outline.json  → Outline | null
  style.json    → StyleSettings | null（与 DEFAULT_STYLE 合并）
  slides/*.html → Array<{ id, html, layout, status: 'done' }>
  index.html    → string | null（legacy 字段保留）
返回 ProjectDetail（每个独立字段 nullable）
```

`ProjectDetail` 类型扩展（`src/shared/types.ts`）：

```ts
export interface ProjectDetail extends ProjectMeta {
  // 现有
  html: string | null
  htmlSize: number | null
  lastGeneratedAt: number | null
  lastError: string | null
  // 新增
  source: string | null
  // 注意避开 ProjectMeta.outline 这个 legacy markdown 字段，命名用 structuredOutline 区分
  structuredOutline: Outline | null
  style: StyleSettings | null
  slides: Array<{
    id: string
    html: string
    layout?: 1 | 2 | 3 | 4 | 5
    status: 'done' | 'failed'
    error?: string
  }>
}
```

### 3.2 渲染进程

新增 `useProjectDetailStore`：

```ts
interface ProjectDetailState {
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  loadedProjectId: string | null
  load: (id: string) => Promise<void>
  reload: () => Promise<void>
  patchDetail: (patch: Partial<ProjectDetail>) => void
  applySnapshot: (d: ProjectDetail) => void  // 派发给各 store
}
```

派发逻辑（applySnapshot）：
- `useOutlineStore.applyDetail({ slides: detail.structuredOutline.slides, generatedAt, globalStyle })`
- `usePptGenerationStore.applyDetail(slides)` — 把 slides[] 转为 `{slides: Record<id, PptSlide>}` 并设置 phase='done'
- 不动 `useProjectStore`（不刷新列表）

### 3.3 加载时机

`useLoadProjectDetail(id)` hook：
- 在 `ProjectStepper` 或各阶段页面 `mount` 时触发
- 如果 `loadedProjectId === id` 直接跳过（避免重复拉）
- 监听 `id` 变化重拉

---

## 4. 组件 / 文件清单

### 4.1 新增 (3)

| 文件 | 作用 |
|---|---|
| `src/shared/types.ts` (扩展) | `ProjectDetail` 加 `source` / `structuredOutline` / `style` / `slides` |
| `src/renderer/stores/projectDetail.ts` | `useProjectDetailStore` |
| `src/renderer/hooks/useLoadProjectDetail.ts` | 路由级加载 |

### 4.2 修改 (5)

| 文件 | 变更 |
|---|---|
| `src/main/fs/projects.ts` | `getProject` 多文件合并（source / structuredOutline / style / slides） |
| `src/renderer/stores/outline.ts` | 加 `applyDetail`，删假 `load()` |
| `src/renderer/stores/pptGeneration.ts` | 加 `applyDetail`，新 `reset()` 行为 |
| `src/renderer/routes/CollectEditor.tsx` | 显式保存按钮；mount 恢复 source；未保存离开提示 |
| `src/renderer/routes/OutlinePage.tsx` | 删防抖自动保存；显式保存按钮；未保存离开提示 |
| `src/renderer/routes/GeneratePage.tsx` | mount 恢复 slides；删自动 start；重新生成 confirm |

### 4.3 删除 (0)

`useGenerationStore`（legacy 合并 HTML 路径）暂保留，注释指向 `usePptGenerationStore`，下个 PR 清。

### 4.4 文件总数与拆分考量

总改动：3 新增 + 5 修改 = 8 文件，加 4 个测试 = 12 文件。

本设计触及主进程 + 多 store + 多页面 的数据流改造，无法收口到 ≤3 文件范围。建议一次性提交，但需要：

1. 拆分实施顺序（见 §9），先底层（fs + types + store）后上层（pages）
2. 每步跑 `bun run typecheck` 守住类型
3. 不做无关重构（`useGenerationStore` 清理、IPC 重命名等留待下个 PR）

---

## 5. 数据流

### 5.1 冷启动

```
/projects/:id/collect mount
  → useLoadProjectDetail(id)
    → api.project.detail(id)
      → fs.getProject(id) 合并读取
    → useProjectDetailStore.setDetail(d)
      → applySnapshot(d)
        → useOutlineStore.applyDetail(...)
        → usePptGenerationStore.applyDetail(...)
  → CollectEditor useState 从 detail store 初始化 source/topic
```

### 5.2 保存项目信息

```
用户编辑 (本地 useState)
  → 点「保存项目信息」
    → api.stage.collectSave(id, topic, source)
    → 成功 → useProjectDetailStore.patchDetail({source, topic})
    → toast.success
  → 点「下一步」
    - 本地 dirty → Modal.confirm 三选项（保存 / 不保存 / 取消）
    - 取消 → 停留
```

### 5.3 保存大纲

```
OutlineCard 编辑 → localOutline (useState)
  → 点「保存大纲」
    → for each dirty slide: api.stage.outlineUpdate
    → 全成功后 patchDetail({structuredOutline})
    → 部分失败 → toast.warn 列失败项
```

### 5.4 生成页恢复

```
/projects/:id/generate mount
  → ppt.applyDetail(detail.slides)
  → UI 渲染已生成页面（按 layout）
  → 「重新生成」按钮
    → Modal.confirm「将覆盖 X 页生成结果」
    → 用户确认 → ppt.reset() → ppt.start(id)
      → 后端 clearProjectSlides + 重跑 orchestrator
```

### 5.5 关键不变量

- `useProjectDetailStore` 是渲染端 single source of truth
- stage stores 是 detail 的视图投影
- 用户编辑先写本地 draft，保存成功才回写 detail
- IPC 失败不污染 detail，保留本地 draft

---

## 6. 错误处理

| 失败点 | 行为 |
|---|---|
| `project.detail` 抛错 | toast.error('加载失败')，nav 回 `/projects` |
| `collectSave` 失败 | toast.error，保留 draft，按钮恢复可点 |
| `outlineUpdate` 部分失败 | 失败 slide 在 store 中标 `error`，toast.warn 列失败项 |
| `htmlGenerate` 网络错 | 沿用 orchestrator 行为：slide status='failed'，detail 同步 |
| 「下一步」未保存提示取消 | 原地停留 |
| 重新生成时已有 slides | 先 confirm，用户取消则不调 start |

---

## 7. 测试

| 测试 | 文件 |
|---|---|
| `fs.getProject` 合并：source 缺失 → null；slides 目录不存在 → `[]`；legacy index.html 兼容 | `src/main/fs/__tests__/projects.test.ts` |
| `useProjectDetailStore.applySnapshot` 派发测试（mock 子 store setter） | `src/renderer/stores/__tests__/projectDetail.test.ts` |
| `usePptGenerationStore.applyDetail` 灌入 status/html/layout 测试 | `src/renderer/stores/__tests__/pptGeneration.test.ts` |
| `OutlinePage` 未保存离开提示（mock dirty 状态） | `src/renderer/routes/__tests__/OutlinePage.test.tsx` |

E2E 不新增（现有路径仍适用）。

---

## 8. 风险与回退

- **`getProject` 性能**：合并 5 个文件，单项目 ~10ms 量级；可在后续加缓存
- **`useProjectDetailStore` 派发开销**：派发只是 store.setState，开销可忽略
- **回退**：所有现有 IPC 不变；旧调用方继续可用

---

## 9. 实施顺序

1. 主进程：`ProjectDetail` 类型 + `fs.getProject` 合并读取
2. 渲染：`useProjectDetailStore` + `useLoadProjectDetail`
3. 现有 stores 加 `applyDetail`
4. GeneratePage 切换到手动
5. CollectEditor / OutlinePage 加显式保存按钮 + 未保存提示
6. 测试 + typecheck