import { useEffect } from "react";
import { api } from "../lib/api.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";

/**
 * Mounted at the app root. Forwards STAGE_HTML_SLIDE_READY and
 * STAGE_HTML_GENERATE_DONE events to the pptGeneration store.
 */
export function useHtmlGenerationSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onHtmlSlideReady((e) =>
      usePptGenerationStore.getState().applySlideReady(e),
    );
    const u2 = api.stage.onHtmlGenerateDone((e) =>
      usePptGenerationStore.getState().applyGenerateDone(e),
    );
    return () => {
      u1();
      u2();
    };
  }, []);
}
