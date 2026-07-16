import { useIntentGenerationStore } from "../stores/intentGeneration.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";

/**
 * Aggregate the 5-step progress card's per-step lifecycle from the three
 * stores that drive the workbench. Steps that don't have a backing store
 * (`search`, `verify`) stay at `"pending"` until they're implemented.
 */
export function useGenerationStepStates(): Record<string, "pending" | "running" | "done" | "error"> {
  const intentPhase = useIntentGenerationStore((s) => s.phase);
  const outlinePhase = useStageStreamStore((s) => s.phase);
  const htmlPhase = usePptGenerationStore((s) => s.phase);
  return {
    intent:
      intentPhase === "done" ? "done"
      : intentPhase === "running" ? "running"
      : intentPhase === "error" ? "error"
      : "pending",
    search: "pending",
    outline:
      outlinePhase === "streaming" ? "running"
      : outlinePhase === "done" ? "done"
      : outlinePhase === "error" ? "error"
      : "pending",
    compose:
      htmlPhase === "running" ? "running"
      : htmlPhase === "done" ? "done"
      : htmlPhase === "error" ? "error"
      : "pending",
    verify: "pending",
  };
}