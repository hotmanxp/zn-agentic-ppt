import { Buildings, FileText } from "@phosphor-icons/react";
import type { Scenario } from "./data/types.js";

export function getBriefFieldCopy(scenario: Scenario | null | undefined) {
  const isInternal = scenario?.id === "internal";
  const isLaunch = scenario?.id === "launch";
  return {
    intro: isInternal
      ? "可以。为了让年度汇报更贴合管理场景，我需要先知道汇报主题、汇报对象、目标、时长和页数。你可以在下方填写，也可以直接用一句话说明。"
      : isLaunch
        ? "可以。为了让演讲稿更贴合发布会场景，我需要先知道发布主题、听众、目标、时长和页数。你可以在下方填写，也可以直接用一句话说明。"
        : "可以。为了让材料更贴合真实场景，我需要先知道客户、听众、目标、时长和页数。你可以在下方填写，也可以直接用一句话说明。",
    header: isInternal
      ? "填写汇报主题、对象、目标、时长和页数"
      : isLaunch
        ? "填写发布主题、听众、目标、时长和页数"
        : "填写客户、听众、目标、时长和页数",
    primaryLabel: isInternal ? "汇报主题" : isLaunch ? "发布主题" : "客户",
    primaryPlaceholder: isInternal
      ? "例如：2026 年度培训工作汇报 / 年度经营复盘"
      : isLaunch
        ? "例如：知鸟 AI 陪练新品发布 / AI 知识库发布"
        : "例如：某股份制银行 / 某事业部",
    primaryIcon: isInternal || isLaunch ? <FileText size={15} /> : <Buildings size={15} />,
    audienceLabel: isInternal ? "汇报对象" : "听众",
    audiencePlaceholder: isInternal
      ? "例如：管理层、部门负责人、项目委员会"
      : isLaunch
        ? "例如：客户、合作伙伴、内部业务团队"
        : "例如：培训负责人、业务负责人",
    goalPlaceholder: isInternal
      ? "希望汇报后推动什么决策或行动？"
      : isLaunch
        ? "希望听众听完后记住什么、采取什么行动？"
        : "希望听众在会后采取什么行动？",
    naturalPlaceholder: isInternal
      ? "也可以直接说：主题是年度培训工作汇报，面向管理层，控制在 20 分钟、10 页…"
      : isLaunch
        ? "也可以直接说：发布知鸟 AI 陪练，面向客户和业务团队，控制在 20 分钟、10 页…"
        : "也可以直接说：客户是某银行，面向培训负责人，控制在 20 分钟、10 页…",
    recordPrimary: isInternal ? "主题" : isLaunch ? "发布主题" : "客户",
    recordAudience: isInternal ? "对象" : "听众",
  };
}
