declare module './sdk.mjs' {
  export function query(opts: {
    prompt: string
    options: {
      cwd: string
      model: string
      env: Record<string, string>
      permissionMode: string
      allowDangerouslySkipPermissions: boolean
      canUseTool: () => Promise<{ behavior: string; message: string }>
      maxTurns: number
    }
  }): AsyncGenerator<any, void, unknown>
  export const listSessions: any
  export const getSessionInfo: any
  export const getSessionMessages: any
  export const createSession: any
  export const forkSession: any
  export const deleteSession: any
  export const renameSession: any
  export const tagSession: any
  export const queryAsync: any
  export const unstable_v2_prompt: any
  export const unstable_v2_createSession: any
  export const unstable_v2_resumeSession: any
  export const tool: any
  export const sdkErrorFromType: any
  export const SDKError: any
  export const SDKAuthenticationError: any
  export const SDKBillingError: any
  export const SDKInvalidRequestError: any
  export const SDKMaxOutputTokensError: any
  export const SDKRateLimitError: any
  export const SDKServerError: any
  export const ClaudeError: any
  export const AbortError: any
  export const createSdkMcpServer: any
}
