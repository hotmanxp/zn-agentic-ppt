import { FileText } from "@phosphor-icons/react";
import { getBriefFieldCopy } from "../briefCopy.js";
import type { Brief, Scenario } from "../data/types.js";
import { StepRecord } from "./StepRecord.js";

export function ConfirmedTaskRecord({ scenario, brief }: { scenario: Scenario; brief: Brief }) {
  const copy = getBriefFieldCopy(scenario);
  const rows = [
    `${copy.recordPrimary}：${brief.client || "待补充"}`,
    `${copy.recordAudience}：${brief.audience || "待补充"}`,
    `目标：${brief.goal || "待补充"}`,
    `${brief.duration || "待定"}`,
    `${brief.pages || "待定"}`,
  ];
  return (
    <StepRecord icon={<FileText size={16} />} title="已确认任务要求" meta={rows}>
      <p>后续查找资料、生成大纲和页面内容都会按这些要求执行。</p>
    </StepRecord>
  );
}
