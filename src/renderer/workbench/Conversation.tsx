import { CaretDown, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";
import { usePptGenerationStore } from "../stores/pptGeneration.js";
import { useStageStreamStore } from "../stores/stageStream.js";
import { useWorkbenchStore } from "../stores/workbench.js";
import { GenerationCard } from "./GenerationCard.js";
import { OutlineApproval } from "./OutlineApproval.js";
import { ProcessCard } from "./ProcessCard.js";
import { CompletionCard } from "./completion/CompletionCard.js";
import { RevisionMessage } from "./completion/RevisionMessage.js";
import { SourceRequirementMessage } from "./completion/SourceRequirementMessage.js";
import { OUTLINE_BUILD_STEPS } from "./data/outlineBuildSteps.js";
import { SOURCE_SEARCH_STEPS } from "./data/sourceSearchSteps.js";
import { KNOWN_SOURCES } from "./data/sources.js";
import type { SourceItem } from "./data/types.js";
import { AgentIdentity } from "./primitives/AgentIdentity.js";
import { ConfirmedOutlineRecord } from "./primitives/ConfirmedOutlineRecord.js";
import { ConfirmedSourcesRecord } from "./primitives/ConfirmedSourcesRecord.js";
import { ConfirmedTaskRecord } from "./primitives/ConfirmedTaskRecord.js";
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
  const clarificationNotes = useWorkbenchStore((s) => s.clarificationNotes);
  const sourceRequirements = useWorkbenchStore((s) => s.sourceRequirements);
  const selectedSources = useWorkbenchStore((s) => s.selectedSources);
  const uploadedSources = useWorkbenchStore((s) => s.uploadedSources);
  const outlineDraft = useWorkbenchStore((s) => s.outlineDraft);
  const revisions = useWorkbenchStore((s) => s.revisions);
  const deckVersions = useWorkbenchStore((s) => s.deckVersions);
  const pendingRevisionId = useWorkbenchStore((s) => s.pendingRevisionId);
  const toggleSource = useWorkbenchStore((s) => s.toggleSource);
  const setActiveSource = useWorkbenchStore((s) => s.setActiveSource);
  const updateOutlineItem = useWorkbenchStore((s) => s.updateOutlineItem);
  const addOutlineItem = useWorkbenchStore((s) => s.addOutlineItem);
  const removeOutlineItem = useWorkbenchStore((s) => s.removeOutlineItem);
  const moveOutlineItem = useWorkbenchStore((s) => s.moveOutlineItem);
  const openDeckPreview = useWorkbenchStore((s) => s.openDeckPreview);
  const searchProgress = useWorkbenchStore((s) => s.searchProgress);
  const appendDeckVersion = (_revision?: string, _revisionId?: string) => {
    // No-op stub kept for the onOpenDeck callback signature. Deck versions
    // are seeded exclusively by the Workbench watcher on `pptGen === 'done'`.
  };

  const sources: SourceItem[] = [...KNOWN_SOURCES, ...uploadedSources];
  const stageStream = useStageStreamStore();
  const pptGen = usePptGenerationStore();

  const isAfterSources = [
    "searching",
    "sources",
    "buildingOutline",
    "outline",
    "generating",
    "complete",
  ].includes(phase);
  const isAfterOutline = ["buildingOutline", "outline", "generating", "complete"].includes(phase);
  const isAfterGenerating = ["generating", "complete"].includes(phase);

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
      {isAfterSources && <ConfirmedTaskRecord scenario={scenario} brief={brief} />}

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
            <p>
              {scenario.id === "launch"
                ? "我先找到了可用资料。已优先选择版本较新、权限可用、适合发布会表达的内容；你上传的材料只用于本次生成。请确认本次采用哪些资料，确认后我再生成大纲。"
                : "我先找到了可用资料。已优先选择版本较新、权限可用、适合对客户展示的内容；你上传的材料只用于本次生成。请确认本次采用哪些资料，确认后我再生成大纲。"}
            </p>
            <SourceCall
              sources={sources}
              selectedSources={selectedSources}
              onToggleSource={toggleSource}
              onOpenSource={setActiveSource}
            />
          </div>
        </article>
      )}

      {sourceRequirements.map((req, i) => (
        <SourceRequirementMessage key={`${req}-${i}`} text={req} />
      ))}

      {isAfterSources && (
        <ConfirmedSourcesRecord
          sources={sources}
          selectedSources={selectedSources}
          sourceRequirements={sourceRequirements}
          onOpenSource={setActiveSource}
        />
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
            <p>
              资料已确认。我按金字塔思维整理了一版大纲：先给出核心结论，再展开业务问题、验证路径、能力与案例，最后收束到下一步建议。请确认结构后再生成完整
              PPT。
            </p>
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

      {isAfterOutline && <ConfirmedOutlineRecord outlineItems={outlineDraft} />}

      {isAfterGenerating && (
        <article className="message-row is-agent">
          <AgentIdentity />
          <div className="agent-message">
            {phase === "generating" && (
              <GenerationCard
                progress={
                  pptGen.total > 0 ? Math.round((pptGen.completed / pptGen.total) * 100) : 0
                }
                brief={brief}
              />
            )}
            {deckVersions.map((v, idx) => (
              <CompletionCard
                key={v.id}
                brief={brief}
                scenario={scenario}
                version={v}
                versionNumber={idx + 1}
                isLatest={idx === deckVersions.length - 1}
                onOpenDeck={() => {
                  appendDeckVersion(v.revision, v.revisionId);
                  openDeckPreview();
                }}
              />
            ))}
          </div>
        </article>
      )}

      {revisions.map((revision, index) => (
        <div className="revision-thread" key={revision.id || `${revision.text}-${index}`}>
          <RevisionMessage revision={revision} />
          {phase === "generating" && pendingRevisionId === revision.id && (
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
        </div>
      ))}
    </div>
  );
}
