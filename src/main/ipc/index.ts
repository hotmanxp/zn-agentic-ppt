import { registerBriefIPC } from "./brief.js";
import { registerGenerationIPC } from "./generation.js";
import { registerProjectIPC } from "./project.js";
import { registerSettingsIPC } from "./settings.js";
import { registerStageIPC } from "./stage.js";

export function registerAllIPC(): void {
  registerProjectIPC();
  registerSettingsIPC();
  registerGenerationIPC();
  registerStageIPC();
  registerBriefIPC();
}
