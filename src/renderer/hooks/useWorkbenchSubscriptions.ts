import { useEffect } from "react";

/**
 * Mounted at Workbench root. Previously subscribed to brief-agent events
 * so the AskUserQuestionModal could pick them up; the brief system has
 * been removed (the ClarificationComposer form now writes the brief
 * directly), so this hook is a no-op kept for symmetry with other
 * subscription hooks (`useStageStreamSubscription`, `useHtmlGenerationSubscription`).
 *
 * If new push-events are added later, the registration pattern from those
 * siblings is the right starting point.
 */
export function useWorkbenchSubscriptions(): void {
  useEffect(() => {
    return () => {
      // no subscriptions to clean up
    };
  }, []);
}
