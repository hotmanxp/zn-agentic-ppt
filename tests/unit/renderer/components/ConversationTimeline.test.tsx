/**
 * Tests that Conversation.tsx wires ChatTimeline from the chat store
 * rather than synthesising revisions-only pseudo messages.
 *
 * Strategy: stub the workbench, pptGeneration, stageStream and chat
 * stores, plus the inner UI modules that Conversation composes, then
 * render Conversation via react-dom/server and assert the timeline is
 * present and the hard-coded agent prose is gone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock the api module BEFORE Conversation (which transitively imports
// the api bridge) is loaded. Otherwise `window.api` is referenced at
// module-evaluation time.
vi.mock("../../../../src/renderer/lib/api.js", () => ({
  api: {
    chat: {
      load: vi.fn(),
      send: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      removeQueueItem: vi.fn(),
      appendWorkflow: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    },
  },
}));

const workbenchState: any = {
  phase: "complete",
  taskText: "demo task",
  scenario: { id: "sales", name: "销售", body: "", audience: "", goal: "", duration: "", pages: "" },
  brief: { client: "", audience: "", goal: "", duration: "", pages: "", template: "" },
  clarificationNotes: [],
  sourceRequirements: [],
  selectedSources: [],
  uploadedSources: [],
  outlineDraft: [],
  revisions: [],
  deckVersions: [
    { id: "v1", pageCount: 8, sourceCount: 2, createdAt: 1 },
  ],
  pendingRevisionId: null,
  toggleSource: vi.fn(),
  setActiveSource: vi.fn(),
  updateOutlineItem: vi.fn(),
  addOutlineItem: vi.fn(),
  removeOutlineItem: vi.fn(),
  moveOutlineItem: vi.fn(),
  openDeckPreview: vi.fn(),
  searchProgress: 0,
};

vi.mock("../../../../src/renderer/stores/workbench.js", () => ({
  useWorkbenchStore: (selector: any) => selector(workbenchState),
}));

const pptGenState = { phase: "done", total: 8, completed: 8 };

vi.mock("../../../../src/renderer/stores/pptGeneration.js", () => ({
  usePptGenerationStore: (selector?: any) => (selector ? selector(pptGenState) : pptGenState),
}));

const stageStreamState = { phase: "done", chars: 0 };

vi.mock("../../../../src/renderer/stores/stageStream.js", () => ({
  useStageStreamStore: (selector?: any) => (selector ? selector(stageStreamState) : stageStreamState),
}));

const chatState: any = {
  items: [
    {
      kind: "workflow",
      event: {
        id: "evt-1",
        projectId: "p-1",
        type: "generation-completed",
        createdAt: 1,
        payload: { version: { pageCount: 8, sourceCount: 2 } },
      },
    },
  ],
  queue: [],
  retry: vi.fn(),
  removeQueueItem: vi.fn(),
};

vi.mock("../../../../src/renderer/stores/chat.js", () => ({
  useChatStore: (selector: any) => selector(chatState),
}));

vi.mock("../../../../src/renderer/workbench/data/sources.js", () => ({
  KNOWN_SOURCES: [],
}));

// Stub ChatTimeline to a marker div so the test is independent of the
// timeline internals.
vi.mock("../../../../src/renderer/workbench/ChatTimeline.js", () => ({
  ChatTimeline: (props: any) =>
    createElement(
      "div",
      {
        "data-testid": "chat-timeline",
        "data-items": JSON.stringify(props.items.map((i: any) => i.kind)),
      },
      `timeline(${props.items.length})`,
    ),
}));

import { Conversation } from "../../../../src/renderer/workbench/Conversation.js";

beforeEach(() => {
  workbenchState.phase = "complete";
  workbenchState.revisions = [];
  chatState.items = [];
  chatState.queue = [];
});

describe("Conversation — chat timeline integration", () => {
  it("renders ChatTimeline from the chat store when items exist", () => {
    chatState.items = [
      {
        kind: "workflow",
        event: {
          id: "evt-1",
          projectId: "p-1",
          type: "generation-completed",
          createdAt: 1,
          payload: {},
        },
      },
    ];
    const html = renderToStaticMarkup(createElement(Conversation));
    expect(html).toContain("data-testid=\"chat-timeline\"");
    expect(html).toContain("timeline(1)");
  });

  it("removes hardcoded agent prose and revisions-only pseudo messages", () => {
    // Read the source file and assert the legacy strings are gone.
    const src = readFileSync(
      resolve(__dirname, "../../../../src/renderer/workbench/Conversation.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/我先找到了可用资料/);
    expect(src).not.toMatch(/按金字塔思维整理了一版大纲/);
    // The revisions-only pseudo-message loop must be gone.
    expect(src).not.toMatch(/revisions\.map\(/);
  });

  it("does not synthesise a UserMessage from notes in ClarificationFlow", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../../src/renderer/workbench/ClarificationFlow.tsx",
      ),
      "utf8",
    );
    // The old pattern mapped notes to UserMessage; that must be gone.
    expect(src).not.toMatch(/notes\.map\(/);
  });
});