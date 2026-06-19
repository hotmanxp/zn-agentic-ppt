import { registerProjectIPC } from './project.js'
import { registerSettingsIPC } from './settings.js'
import { registerGenerationIPC } from './generation.js'
import { registerStageIPC } from './stage.js'
import { registerBriefIPC } from './brief.js'

export function registerAllIPC(): void {
  registerProjectIPC()
  registerSettingsIPC()
  registerGenerationIPC()
  registerStageIPC()
  registerBriefIPC()
}
