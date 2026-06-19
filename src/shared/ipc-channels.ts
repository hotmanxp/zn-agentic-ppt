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

  // Stage 1-4 (renderer → main, invoke)
  STAGE_COLLECT_SAVE: 'stage:collect-save',
  STAGE_OUTLINE_GENERATE: 'stage:outline-generate',
  STAGE_OUTLINE_UPDATE: 'stage:outline-update',
  STAGE_SLIDE_ADD: 'stage:slide-add',
  STAGE_SLIDE_DELETE: 'stage:slide-delete',
  STAGE_SLIDE_REGENERATE: 'stage:slide-regenerate',
  STAGE_HTML_GENERATE: 'stage:html-generate',
  STAGE_STYLE_SAVE: 'stage:style-save',

  // Main → renderer (push)
  HTML_SLIDE_UPDATED: 'html:slide-updated',
  STAGE_OUTLINE_STREAM: 'stage:outline-stream',
} as const
