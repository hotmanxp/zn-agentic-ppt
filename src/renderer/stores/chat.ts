import type {
  ChatEvent,
  ChatQueueItem,
  ChatSnapshot,
  ChatTimelineItem,
  ChatWorkflowEvent,
} from "@shared/types";
import { create } from "zustand";
import { api } from "../lib/api.js";

interface ChatState {
  projectId: string | null;
  items: ChatTimelineItem[];
  queue: ChatQueueItem[];
  paused: boolean;
  pauseReason: string | null;
  loading: boolean;
  error: string | null;

  load(projectId: string): Promise<void>;
  send(text: string): Promise<string | null>;
  cancel(): Promise<void>;
  retry(queueId: string): Promise<void>;
  removeQueueItem(queueId: string): Promise<void>;
  appendWorkflow(
    event: Omit<ChatWorkflowEvent, "id" | "projectId" | "createdAt">,
  ): Promise<void>;
  applyEvent(event: ChatEvent): void;
  reset(): void;
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  projectId: null,
  items: [],
  queue: [],
  paused: false,
  pauseReason: null,
  loading: false,
  error: null,

  load: async (projectId) => {
    set({ projectId, loading: true, error: null });
    try {
      const snap = await api.chat.load(projectId);
      const apply: Partial<ChatState> = {
        projectId: snap.projectId,
        items: snap.items,
        queue: snap.queue,
        paused: snap.paused,
        pauseReason: snap.pauseReason ?? null,
        loading: false,
        error: null,
      };
      set(apply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Preserve existing items/queue; only flip loading + error.
      set({ loading: false, error: msg });
    }
  },

  send: async (text) => {
    const id = get().projectId;
    if (!id) return null;
    try {
      const r = await api.chat.send(id, text);
      return r.queueId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      return null;
    }
  },

  cancel: async () => {
    const id = get().projectId;
    if (!id) return;
    await api.chat.cancel(id);
  },

  retry: async (queueId) => {
    const id = get().projectId;
    if (!id) return;
    await api.chat.retry(id, queueId);
  },

  removeQueueItem: async (queueId) => {
    const id = get().projectId;
    if (!id) return;
    await api.chat.removeQueueItem(id, queueId);
  },

  appendWorkflow: async (event) => {
    const id = get().projectId;
    if (!id) return;
    await api.chat.appendWorkflow(id, event);
  },

  applyEvent: (event) => {
    const state = get();

    // project-changed is a hint to subscribers (e.g. detail store reload);
    // do not mutate the timeline here.
    if (event.type === "project-changed") return;

    // Ignore events for any project other than the currently loaded one.
    if (event.projectId !== state.projectId) return;

    if (event.type === "snapshot") {
      const snap: ChatSnapshot = event.snapshot;
      set({
        projectId: snap.projectId,
        items: snap.items,
        queue: snap.queue,
        paused: snap.paused,
        pauseReason: snap.pauseReason ?? null,
      });
      return;
    }

    if (event.type === "assistant-delta") {
      set((s) => {
        const last = s.items[s.items.length - 1];
        if (last && last.kind === "message" && last.role === "assistant" && last.queueId === event.queueId) {
          const merged: ChatTimelineItem = { ...last, text: `${last.text}${event.text}` };
          return { items: [...s.items.slice(0, -1), merged] };
        }
        const fresh: ChatTimelineItem = {
          kind: "message",
          id: nowId("msg"),
          projectId: event.projectId,
          role: "assistant",
          text: event.text,
          createdAt: Date.now(),
          queueId: event.queueId,
        };
        return { items: [...s.items, fresh] };
      });
      return;
    }

    if (event.type === "tool-start") {
      set((s) => {
        const item: ChatTimelineItem = {
          kind: "tool",
          id: nowId("tool"),
          projectId: event.projectId,
          toolUseId: event.toolUseId,
          name: event.name,
          input: event.input,
          status: "running",
          createdAt: Date.now(),
        };
        return { items: [...s.items, item] };
      });
      return;
    }

    if (event.type === "tool-done" || event.type === "tool-error") {
      const finishedAt = Date.now();
      set((s) => ({
        items: s.items.map((it) => {
          if (it.kind !== "tool" || it.toolUseId !== event.toolUseId) return it;
          if (event.type === "tool-done") {
            return { ...it, status: "done", output: event.output, finishedAt };
          }
          return { ...it, status: "error", error: event.error, finishedAt };
        }),
      }));
      return;
    }

    if (event.type === "queue-status") {
      set((s) => {
        const idx = s.queue.findIndex((q) => q.id === event.item.id);
        const nextQueue =
          idx >= 0
            ? s.queue.map((q, i) => (i === idx ? event.item : q))
            : [...s.queue, event.item];
        return {
          queue: nextQueue,
          paused: event.paused,
          pauseReason: event.pauseReason ?? null,
        };
      });
      return;
    }
  },

  reset: () =>
    set({
      projectId: null,
      items: [],
      queue: [],
      paused: false,
      pauseReason: null,
      loading: false,
      error: null,
    }),
}));