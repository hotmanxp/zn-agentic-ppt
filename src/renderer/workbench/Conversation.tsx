import { CaretDown, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";
import { useChatStore } from "../stores/chat.js";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { ChatTimeline } from "./ChatTimeline.js";
import { GenerationCard } from "./GenerationCard.js";
import { OutlineApproval } from "./OutlineApproval.js";
import { ProcessCard } from "./ProcessCard.js";
import { OUTLINE_BUILD_STEPS } from "./data/outlineBuildSteps.js";
import { SOURCE_SEARCH_STEPS } from "./data/sourceSearchSteps.js";
import { KNOWN_SOURCES } from "./data/sources.js";
import type { SourceItem } from "./data/types.js";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { UserMessage } from "./primitives/UserMessage.js";

function SourceCall({
  sources,
  selectedSources,
  onToggleSource,
  onOpenSource,
}: {
  sources: SourceItem[];
  selectedSources: string[];
  onToggleSource: (id: string) => void;
  onOpenSource: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tool-call-card">
      <button className="tool-call-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tool-icon">
          <MagnifyingGlass size={16} />
        </span>
        <span>
          <b>引用资料确认</b>
          <small>
            已找到 {sources.length} 份可用资料，当前采用 {selectedSources.length} 份
          </small>
        </span>
        <span className="tool-duration">可调整</span>
        {open ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>
      {open && (
        <div className="tool-call-content">
          <div className="tool-call-body">
            {sources.map((source) => {
              const selected = selectedSources.includes(source.id);
              return (
                <div className={`source-result ${selected ? "is-selected" : ""}`} key={source.id}>
                  <button
                    className="source-result-main"
                    onClick={() => onOpenSource(source.id)}
                    aria-label={`查看引用资料：${source.title}`}
                  >
                    <span className="source-file-icon">
                      {source.id.startsWith("upload-") ? "📎" : "📄"}
                    </span>
                    <span className="source-result-copy">
                      <b>{source.title}</b>
                      <small>
                        {source.library} · {source.updated}
                      </small>
                      <em>{source.used} · 点击查看详情</em>
                    </span>
                  </button>
                  <button
                    className="source-check"
                    onClick={() => onToggleSource(source.id)}
                    aria-pressed={selected}
                    aria-label={selected ? `取消采用：${source.title}` : `采用：${source.title}`}
                  >
                    {selected && "✓"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Conversation() {
  const phase = useWorkbenchStore((s) => s.phase);
  const taskText = useWorkbenchStore((s) => s.taskText);
  const scenario = useWorkbenchStore((s) => s.scenario);
  const brief = useWorkbenchStore((s) => s.brief);
  const sourceRequirements = useWorkbenchStore((s) => s.sourceRequirements);
  const selectedSources = useWorkbenchStore((s) => s.selectedSources);
  const uploadedSources = useWorkbenchStore((s) => s.uploadedSources);
  const outlineDraft = useWorkbenchStore((s) => s.outlineDraft);
  const deckVersions = useWorkbenchStore((s) => s.deckVersions);
  const toggleSource = useWorkbenchStore((s) => s.toggleSource);
  const setActiveSource = useWorkbenchStore((s) => s.setActiveSource);
  const updateOutlineItem = useWorkbenchStore((s) => s.updateOutlineItem);
  const addOutlineItem = useWorkbenchStore((s) => s.addOutlineItem);
  const removeOutlineItem = useWorkbenchStore((s) => s.removeOutlineItem);
  const moveOutlineItem = useWorkbenchStore((s) => s.moveOutlineItem);
  const openDeckPreview = useWorkbenchStore((s) => s.openDeckPreview);
  const searchProgress = useWorkbenchStore((s) => s.searchProgress);

  const sources: SourceItem[] = [...KNOWN_SOURCES, ...uploadedSources];
  const stageStream = useStageStreamStore();
  const pptGen = usePptGenerationStore();

  // Chat store supplies the persisted timeline; the components below
  // remain only for the still-active stages (searching / sources /
  // buildingOutline / outline / generating) so the live card can stay
  // interactive until completion is recorded by a workflow event.
  const chatItems = useChatStore((s) => s.items);
  const retryQueueItem = useChatStore((s) => s.retry);
  const removeQueueItem = useChatStore((s) => s.removeQueueItem);

  // Progress for the outline generation. Previously this was capped
  // at 75% to leave room for the slide-generation phase (which used
  // the same UI), but that pattern was abandoned: the outline
  // generation is now the only thing in scope while phase ===
  // "buildingOutline", and a stuck 0→75 → jump to 100 is the right
  // shape (no slide phase to share this bar with).
  const outlineProgress =
    stageStream.phase === "streaming"
      ? stageStream.chars
      : stageStream.phase === "done"
        ? 100
        : 0;

  return (
    <div className="conversation-stream" aria-live="polite">
      <UserMessage text={taskText} />
      <ChatTimeline
        items={chatItems}
        onRetry={retryQueueItem}
        onRemoveQueueItem={removeQueueItem}
      />

      {phase === "searching" && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <ProcessCard
              title="正在查找资料"
              description="我会先检索企业知识库和本次补充材料，再筛掉不可用版本。"
              progress={searchProgress}
              steps={SOURCE_SEARCH_STEPS}
            />
          </div>
        </article>
      )}

      {phase === "sources" && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <SourceCall
              sources={sources}
              selectedSources={selectedSources}
              onToggleSource={toggleSource}
              onOpenSource={setActiveSource}
            />
          </div>
        </article>
      )}

      {phase === "buildingOutline" && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <ProcessCard
              title="正在生成大纲"
              description="我会把已确认资料整理成可编辑大纲，先给你确认结构。"
              progress={outlineProgress}
              steps={OUTLINE_BUILD_STEPS}
            />
          </div>
        </article>
      )}

      {phase === "outline" && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <OutlineApproval
              brief={brief}
              outlineItems={outlineDraft}
              onAddItem={addOutlineItem}
              onUpdateItem={updateOutlineItem}
              onRemoveItem={removeOutlineItem}
              onMoveItem={moveOutlineItem}
            />
          </div>
        </article>
      )}

      {phase === "generating" && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <GenerationCard
              progress={
                pptGen.total > 0 ? Math.round((pptGen.completed / pptGen.total) * 100) : 0
              }
              brief={brief}
            />
          </div>
        </article>
      )}

      {/* Completed deck versions remain here only when the chat
          timeline has not yet received a generation-completed event
          (legacy stores seeded by the watcher). Once the workflow
          event lands, the CompletionCard comes from the timeline. */}
      {phase === "complete" && deckVersions.length > 0 && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            <button
              type="button"
              className="primary-action"
              onClick={openDeckPreview}
              aria-label="预览最新演示稿"
            >
              预览演示稿
            </button>
          </div>
        </article>
      )}
    </div>
  );
}