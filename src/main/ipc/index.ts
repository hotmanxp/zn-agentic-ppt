import { registerProjectIPC } from './project.js'
import { registerSettingsIPC } from './settings.js'
import { registerGenerationIPC } from './generation.js'

export function registerAllIPC(): void {
  registerProjectIPC()
  registerSettingsIPC()
  registerGenerationIPC()
}
