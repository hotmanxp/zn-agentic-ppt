import { useEffect } from "react";
import { api } from "../lib/api.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";

/**
 * Mounted at the app root. Forwards STAGE_HTML_SLIDE_READY,
 * STAGE_HTML_GENERATE_DONE, and HTML_SLIDE_UPDATED events to the
 * pptGeneration store. The third channel carries single-slide
 * regeneration completions from STAGE_SLIDE_REGENERATE.
 */
export function useHtmlGenerationSubscription(): void {
  useEffect(() => {
    const u1 = api.stage.onHtmlSlideReady((e) =>
      usePptGenerationStore.getState().applySlideReady(e),
    );
    const u2 = api.stage.onHtmlGenerateDone((e) =>
      usePptGenerationStore.getState().applyGenerateDone(e),
    );
    const u3 = api.stage.onSlideUpdated((e) =>
      usePptGenerationStore.getState().applySlideUpdated(e),
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);
}
