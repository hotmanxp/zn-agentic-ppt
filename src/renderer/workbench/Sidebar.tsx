import {
  BookOpen,
  DotsThree,
  FolderOpen,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  Trash,
  UserCircle,
} from "@phosphor-icons/react";
import { App as AntdApp } from "antd";
import { useEffect } from "react";
import { api } from "../lib/api.js";
import { useProjectStore } from "../stores/project.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { BrandMark } from "./primitives/BrandMark.js";

interface SidebarProps {
  onSettings: () => void;
  onNotify: (msg: string) => void;
}

export function Sidebar({ onSettings, onNotify }: SidebarProps) {
  const collapsed = useWorkbenchStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useWorkbenchStore((s) => s.toggleSidebar);
  const activeProjectId = useWorkbenchStore((s) => s.activeProjectId);
  const openProject = useWorkbenchStore((s) => s.openProject);
  const reset = useWorkbenchStore((s) => s.reset);
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.load);
  const removeProject = useProjectStore((s) => s.remove);
  const { modal, message } = AntdApp.useApp();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const recent = projects.slice(0, 12);

  const handleContextMenu = (e: React.MouseEvent, p: { id: string; title: string }) => {
    e.preventDefault();
    modal.confirm({
      title: `项目「${p.title}」`,
      content: "选择要执行的操作",
      okText: "在文件管理器中打开",
      cancelText: "取消",
      okButtonProps: { icon: <FolderOpen size={14} /> },
      onOk: () => {
        api.project.reveal(p.id).then(() => message.success("已在文件管理器中打开"));
      },
    });
  };

  const handleDelete = (e: React.MouseEvent, p: { id: string; title: string }) => {
    e.stopPropagation();
    modal.confirm({
      title: `删除项目「${p.title}」？`,
      content: "项目目录与生成内容将被永久删除，无法恢复。",
      okText: "删除",
      okButtonProps: { danger: true, icon: <Trash size={14} /> },
      cancelText: "取消",
      onOk: async () => {
        await removeProject(p.id);
        if (activeProjectId === p.id) reset();
        onNotify("项目已删除");
      },
    });
  };

  return (
    <aside className={`agent-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="任务导航">
      <div className="sidebar-topline">
        <div className="brand-lockup">
          <BrandMark />
          {!collapsed && <strong>知述</strong>}
        </div>
        <button
          className="icon-button"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          onClick={toggleSidebar}
        >
          <SidebarSimple size={18} />
        </button>
      </div>

      <button
        className="new-task-button"
        aria-label="新建演示任务"
        onClick={async () => {
          try {
            const m = await api.project.create("新演示任务");
            await loadProjects();
            await openProject(m.id);
            useWorkbenchStore.setState({ phase: "clarify" });
          } catch (e) {
            message.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      >
        <Plus size={17} weight="bold" />
        {!collapsed && <span>新建演示任务</span>}
      </button>

      <nav className="sidebar-primary" aria-label="产品导航">
        <button
          className="sidebar-nav-item"
          aria-label="企业知识库"
          onClick={() => onNotify("企业知识库已在新工作区准备打开")}
        >
          <BookOpen size={18} />
          {!collapsed && <span>企业知识库</span>}
        </button>
        <button className="sidebar-nav-item" aria-label="设置" onClick={onSettings}>
          <DotsThree size={18} />
          {!collapsed && <span>设置</span>}
        </button>
      </nav>

      {!collapsed && (
        <section className="history-section">
          <div className="sidebar-section-label">
            <span>最近任务</span>
            <button aria-label="搜索历史任务" onClick={() => onNotify("历史任务搜索已打开")}>
              <MagnifyingGlass size={15} />
            </button>
          </div>
          <div className="history-list">
            {recent.map((p) => (
              <div
                className={`history-item ${p.id === activeProjectId ? "is-active" : ""}`}
                key={p.id}
                onClick={() => void openProject(p.id)}
                onContextMenu={(e) => handleContextMenu(e, p)}
                title={p.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "9px 10px",
                  borderRadius: 8,
                }}
              >
                <span
                  className="history-title"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                  }}
                >
                  {p.title}
                </span>
                <small style={{ color: "#a0a098", fontSize: 12, marginRight: 6 }}>
                  {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                </small>
                <button
                  className="icon-button"
                  aria-label="删除项目"
                  style={{ width: 22, height: 22 }}
                  onClick={(e) => handleDelete(e, p)}
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
            {recent.length === 0 && (
              <div style={{ padding: "8px 10px", color: "#a0a098", fontSize: 12 }}>
                暂无历史任务
              </div>
            )}
          </div>
        </section>
      )}

      <div className="sidebar-footer">
        <button
          className="account-button"
          aria-label="打开个人菜单"
          onClick={() => onNotify("个人菜单已打开")}
        >
          <UserCircle size={24} weight="fill" />
          {!collapsed && (
            <span>
              <b>当前用户</b>
              <small>本地工作区</small>
            </span>
          )}
          {!collapsed && <DotsThree size={18} />}
        </button>
      </div>
    </aside>
  );
}
