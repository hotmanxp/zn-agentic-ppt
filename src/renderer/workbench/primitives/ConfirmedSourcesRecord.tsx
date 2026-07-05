import { FolderSimple } from "@phosphor-icons/react";
import type { SourceItem } from "../data/types.js";
import { SourceIcon } from "./SourceIcon.js";
import { StepRecord } from "./StepRecord.js";

export function ConfirmedSourcesRecord({
  sources,
  selectedSources,
  sourceRequirements,
  onOpenSource,
}: {
  sources: SourceItem[];
  selectedSources: string[];
  sourceRequirements: string[];
  onOpenSource: (id: string) => void;
}) {
  const selected = sources.filter((s) => selectedSources.includes(s.id));
  const sourceNames = selected
    .slice(0, 3)
    .map((s) => s.title)
    .join("、");
  const overflow =
    selected.length > 3 ? ` 等 ${selected.length} 份资料` : selected.length ? "" : "暂无资料";
  return (
    <StepRecord
      icon={<FolderSimple size={16} />}
      title="已确认引用资料"
      meta={[
        `采用 ${selected.length}/${sources.length} 份`,
        sourceRequirements.length ? `附加要求 ${sourceRequirements.length} 条` : "无附加要求",
      ]}
    >
      <p>
        {selected.length
          ? `${sourceNames}${overflow} 将作为大纲和页面内容的依据。`
          : "还没有选择资料，请先确认可用来源。"}
      </p>
      {!!selected.length && (
        <div className="record-source-links">
          {selected.map((source) => (
            <button key={source.id} onClick={() => onOpenSource(source.id)}>
              <SourceIcon type={source.type} size={14} /> {source.title}
            </button>
          ))}
        </div>
      )}
    </StepRecord>
  );
}
