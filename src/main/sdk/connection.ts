// @ts-ignore vendor bundle — no types available
import { query as sdkQuery } from '../../../vendor/sdk.mjs'
import type { Settings } from '../../shared/types.js'
import { app } from 'electron'

export async function testLLMConnection(settings: Settings): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const q = sdkQuery({
      prompt: 'ping',
      options: {
        cwd: app.getPath('temp'),
        model: settings.llm.model,
        env: { ANTHROPIC_BASE_URL: settings.llm.baseUrl, ANTHROPIC_AUTH_TOKEN: settings.llm.apiKey },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        canUseTool: async () => ({ behavior: 'deny', message: 'no tools' }),
        maxTurns: 1,
      },
    })
    let models: string[] = []
    let result: any = null
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        models = msg.models?.map((m: any) => m.value) ?? []
      }
      if (msg.type === 'result') result = msg
      if (result?.is_error) break
    }
    q.close()
    return { ok: result?.subtype === 'success', models }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function supportedModels(settings: Settings): Promise<string[]> {
  const r = await testLLMConnection(settings)
  return r.models ?? []
}
