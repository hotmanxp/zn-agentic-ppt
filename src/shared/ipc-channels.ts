export const IPC = {
  // Main → Renderer (push)
  SDK_EVENT: "sdk:event",
  GENERATION_PROGRESS: "generation:progress",
  GENERATION_DONE: "generation:done",
  GENERATION_ERROR: "generation:error",
  LOG_LINE: "log:line",

  // Renderer → Main (invoke)
  PROJECT_LIST: "project:list",
  PROJECT_GET: "project:get",
  PROJECT_CREATE: "project:create",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  PROJECT_DUPLICATE: "project:duplicate",
  PROJECT_RENAME: "project:rename",
  PROJECT_REVEAL: "project:reveal",
  PROJECT_DETAIL: "project:detail",
  GENERATION_START: "generation:start",
  GENERATION_CANCEL: "generation:cancel",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SETTINGS_TEST_CONNECTION: "settings:test-connection",
  SETTINGS_PROMPT_GET: "settings:prompt-get",
  SETTINGS_PROMPT_SET: "settings:prompt-set",
  SETTINGS_PROMPT_RESET: "settings:prompt-reset",
  SETTINGS_PROMPT_LIST: "settings:prompt-list",
  SETTINGS_PROMPT_LIST_SPECS: "settings:prompt-list-specs",
  SYSTEM_USER_DATA_PATH: "system:userDataPath",

  // Stage 1-4 (renderer → main, invoke)
  STAGE_COLLECT_SAVE: "stage:collect-save",
  STAGE_OUTLINE_GENERATE: "stage:outline-generate",
  STAGE_OUTLINE_READ: "stage:outline-read",
  STAGE_OUTLINE_UPDATE: "stage:outline-update",
  STAGE_SLIDE_ADD: "stage:slide-add",
  STAGE_SLIDE_DELETE: "stage:slide-delete",
  STAGE_SLIDE_REGENERATE: "stage:slide-regenerate",
  STAGE_HTML_GENERATE: "stage:html-generate",
  STAGE_STYLE_SAVE: "stage:style-save",

  // Stage 1-4 cancellation (renderer → main, invoke)
  STAGE_OUTLINE_CANCEL: "stage:outline-cancel",
  STAGE_SLIDE_CANCEL: "stage:slide-cancel",
  STAGE_HTML_CANCEL: "stage:html-cancel",
  STAGE_LAYOUT_GENERATE: "stage:layout-generate",

  // Main → renderer (push)
  HTML_SLIDE_UPDATED: "html:slide-updated",
  STAGE_OUTLINE_STREAM: "stage:outline-stream",
  STAGE_SLIDE_REGENERATE_STREAM: "stage:slide-regenerate-stream",
  STAGE_HTML_SLIDE_READY: "stage:html-slide-ready",
  STAGE_HTML_GENERATE_DONE: "stage:html-generate-done",

  // Stage 1 brief optimization (renderer → main, invoke)
  STAGE_BRIEF_OPTIMIZE_START: "stage:brief-optimize-start",
  STAGE_BRIEF_OPTIMIZE_CANCEL: "stage:brief-optimize-cancel",
  STAGE_BRIEF_OPTIMIZE_ANSWER: "stage:brief-optimize-answer",

  // Main → renderer (push)
  STAGE_ASK_USER_QUESTION: "stage:ask-user-question",
  STAGE_BRIEF_OPTIMIZE_DONE: "stage:brief-optimize-done",
  STAGE_BRIEF_OPTIMIZE_ERROR: "stage:brief-optimize-error",

  // Chat conversation (renderer → main, invoke)
  CHAT_LOAD: "chat:load",
  CHAT_SEND: "chat:send",
  CHAT_CANCEL: "chat:cancel",
  CHAT_RETRY: "chat:retry",
  CHAT_REMOVE_QUEUE_ITEM: "chat:remove-queue-item",
  CHAT_APPEND_WORKFLOW: "chat:append-workflow",

  // Chat conversation (main → renderer, push)
  CHAT_EVENT: "chat:event",
} as const;
