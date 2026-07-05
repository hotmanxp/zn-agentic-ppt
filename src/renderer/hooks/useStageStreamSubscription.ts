import { useEffect } from "react";
import { api } from "../lib/api.js";
import { useStageStreamStore } from "../stores/stageStream.js";

/**
 * Mounted once at the app root. Forwards every STAGE_OUTLINE_STREAM
 * and STAGE_SLIDE_REGENERATE_STREAM event to the store's applyEvent
 * (which filters by projectId/slideId).
 */
export function useStageStreamSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onOutlineStream((e) => useStageStreamStore.getState().applyEvent(e));
    const u2 = api.stage.onSlideRegenStream((e) => useStageStreamStore.getState().applyEvent(e));
    return () => {
      u1();
      u2();
    };
  }, []);
}
