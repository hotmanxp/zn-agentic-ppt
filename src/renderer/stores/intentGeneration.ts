import { create } from "zustand";
import { api } from "../lib/api.js";
import type { IntentStreamPayload } from "../../shared/ipc-types.js";
import type { IntentSummary } from "../../shared/intent.js";

export type IntentPhase = "idle" | "running" | "done" | "cancelled" | "error";

interface IntentState {
  projectId: string | null;
  phase: IntentPhase;
  intent: IntentSummary | null;
  chars: number;
  lastError: string | null;
  run: (projectId: string) => Promise<IntentSummary>;
  applyEvent: (e: IntentStreamPayload) => void;
  reset: () => void;
}

export const useIntentGenerationStore = create<IntentState>((set, get) => ({
  projectId: null,
  phase: "idle",
  intent: null,
  chars: 0,
  lastError: null,

  run: async (projectId) => {
    set({ projectId, phase: "running", intent: null, chars: 0, lastError: null });
    try {
      const r = await api.stage.intentGenerate(projectId);
      if (r.phase === "done" && r.intent) {
        set({ phase: "done", intent: r.intent, chars: JSON.stringify(r.intent).length });
        return r.intent;
      }
      if (r.phase === "cancelled") {
        set({ phase: "cancelled" });
        throw new Error("cancelled");
      }
      const msg = r.error?.message ?? "意图提炼失败";
      set({ phase: "error", lastError: msg });
      throw new Error(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (get().phase !== "error") set({ phase: "error", lastError: msg });
      throw e;
    }
  },

  applyEvent: (e) => {
    if (get().projectId !== e.projectId) return;
    if (e.phase === "streaming") set({ chars: e.chars ?? get().chars });
    else if (e.phase === "done") set({ chars: e.chars ?? get().chars });
    else if (e.phase === "cancelled") set({ phase: "cancelled" });
    else if (e.phase === "error") set({ phase: "error", lastError: e.error?.message ?? "unknown" });
  },

  reset: () =>
    set({ projectId: null, phase: "idle", intent: null, chars: 0, lastError: null }),
}));
