import { registerProjectIPC } from './project.js'
import { registerSettingsIPC } from './settings.js'

export function registerAllIPC(): void {
  registerProjectIPC()
  registerSettingsIPC()
}
