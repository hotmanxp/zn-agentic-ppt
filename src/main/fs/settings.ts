import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getSettingsPath, getDataRoot } from './paths.js'
import type { Settings } from '../../shared/types.js'

let testPath: string | null = null
export function setSettingsPathForTest(p: string): void { testPath = p }
const realPath = (): string => testPath ?? getSettingsPath()

export function defaultSettings(): Settings {
  return {
    llm: {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
    },
    ui: { theme: 'light' },
    paths: { projectsDir: join(getDataRoot(), 'projects') },
  }
}

export async function getSettings(): Promise<Settings> {
  const p = realPath()
  if (!existsSync(p)) return defaultSettings()
  try {
    const raw = await readFile(p, 'utf8')
    return { ...defaultSettings(), ...JSON.parse(raw) } as Settings
  } catch {
    return defaultSettings()
  }
}

export async function setSettings(settings: Settings): Promise<void> {
  const p = realPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(settings, null, 2))
}
