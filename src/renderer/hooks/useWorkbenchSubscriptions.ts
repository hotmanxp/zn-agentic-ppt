import { useEffect } from "react";
import { api } from "../lib/api.js";
import { useChatStore } from "../stores/chat.js";
import { useProjectDetailStore } from "../stores/projectDetail.js";

/**
 * Mounted at Workbench root. Subscribes to chat push events
 * (`api.chat.onEvent`) so the chat timeline reflects main-process
 * state in real time and the project detail reloads whenever the
 * backend signals a change for the currently open project.
 *
 * Sibling subscription hooks (`useStageStreamSubscription`,
 * `useHtmlGenerationSubscription`) follow the same registration
 * pattern.
 */
export function useWorkbenchSubscriptions(): void {
  useEffect(() => {
    const unsubscribe = api.chat.onEvent((event) => {
      useChatStore.getState().applyEvent(event);
      if (
        event.type === "project-changed" &&
        event.projectId === useProjectDetailStore.getState().loadedProjectId
      ) {
        void useProjectDetailStore.getState().reload();
      }
    });
    return unsubscribe;
  }, []);
}