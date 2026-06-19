export const IPC = {
  // Main → Renderer (push)
  SDK_EVENT: 'sdk:event',
  GENERATION_PROGRESS: 'generation:progress',
  GENERATION_DONE: 'generation:done',
  GENERATION_ERROR: 'generation:error',
  LOG_LINE: 'log:line',

  // Renderer → Main (invoke)
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_DUPLICATE: 'project:duplicate',
  PROJECT_RENAME: 'project:rename',
  PROJECT_REVEAL: 'project:reveal',
  GENERATION_START: 'generation:start',
  GENERATION_CANCEL: 'generation:cancel',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_TEST_CONNECTION: 'settings:test-connection',
  SYSTEM_USER_DATA_PATH: 'system:userDataPath',
} as const
