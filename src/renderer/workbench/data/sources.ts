import type { SourceItem, SourcePreview } from "./types.js";

export const KNOWN_SOURCES: SourceItem[] = [
  {
    id: "solution",
    type: "PPTX",
    title: "知鸟 AI 培训解决方案 V3.2",
    library: "企业知识库",
    updated: "2026-06-18",
    status: "最新版本",
    used: "第 3、4、5 页",
  },
  {
    id: "industry",
    type: "PDF",
    title: "银行业人才培养趋势 2026",
    library: "行业知识",
    updated: "2026-05-30",
    status: "已审核",
    used: "第 2 页",
  },
  {
    id: "case",
    type: "DOCX",
    title: "某银行数字化学习客户案例",
    library: "客户案例",
    updated: "2026-04-22",
    status: "可对外",
    used: "第 6 页",
  },
  {
    id: "interview",
    type: "DOCX",
    title: "客户首次访谈纪要",
    library: "本次临时材料",
    updated: "今天 10:24",
    status: "任务专用",
    used: "第 1、7 页",
  },
];

const KNOWN_PREVIEWS: Record<string, SourcePreview> = {
  solution: {
    creator: "解决方案中心 / 产品方案组",
    createdAt: "2026-03-12 14:30",
    directory: [
      "01 产品定位与客户价值",
      "02 银行业培训场景",
      "03 AI 知识库与智能学习",
      "04 平台能力与实施路径",
      "05 安全、权限与交付保障",
    ],
    content: [
      "面向企业培训与数字化学习场景，知鸟以知识库为底座，将课程、案例、制度和业务经验组织为可调用知识。",
      "AI Agent 可根据客户行业、听众角色和会谈目标，自动筛选知识来源、组合方案能力，并保留引用位置。",
      "在银行场景中，重点强调合规、岗位能力建设、知识更新效率和一线应用闭环。",
    ],
  },
  industry: {
    creator: "行业研究组",
    createdAt: "2026-05-20 09:18",
    directory: [
      "01 银行业经营环境变化",
      "02 人才培养趋势",
      "03 合规与审计要求",
      "04 数字化学习实践",
      "05 未来能力建设建议",
    ],
    content: [
      "银行人才培养正从规模化课程交付转向岗位能力经营，培训内容需要更快响应业务和监管变化。",
      "数字化学习平台需要支持知识更新、学习过程留痕、合规审计和跨机构内容复用。",
      "对外材料应避免引用未经确认的行业数字，优先使用趋势判断和可追溯来源。",
    ],
  },
  case: {
    creator: "客户成功部 / 金融行业小组",
    createdAt: "2026-04-08 16:45",
    directory: ["01 客户背景", "02 项目目标", "03 实施路径", "04 运营机制", "05 结果复盘"],
    content: [
      "某银行以重点岗位为试点，先导入标准知识和关键任务，再通过学习、练习、考核形成闭环。",
      "项目采用联合运营机制，每两周复盘知识命中率、内容复用率和一线反馈。",
      "案例适合证明落地路径，但对外展示时需隐藏客户敏感信息。",
    ],
  },
  interview: {
    creator: "林晓宇",
    createdAt: "今天 10:24",
    directory: ["01 参会人和沟通背景", "02 客户关注点", "03 当前材料诉求", "04 后续跟进事项"],
    content: [
      "客户首次沟通更关注平台能否快速复用既有知识，并支持培训负责人面向业务部门讲清价值。",
      "本次材料控制在 15 分钟左右，目标不是完整售前方案，而是争取后续专项演示机会。",
      "需要避免一上来堆叠功能，优先围绕银行人才培养痛点建立共识。",
    ],
  },
};

export function getSourcePreview(source: SourceItem): SourcePreview {
  if (KNOWN_PREVIEWS[source.id]) return KNOWN_PREVIEWS[source.id];
  return {
    creator: "本次任务上传",
    createdAt: source.updated || "刚刚",
    directory: ["01 文件概览", "02 可引用内容", "03 待确认信息"],
    content: [
      "该文件为本次任务补充材料，系统已完成初步解析。",
      "生成大纲和页面内容时，会优先使用其中与客户、听众和目标直接相关的片段。",
      "如材料与企业知识库内容冲突，进入正式生成前需要再次确认。",
    ],
  };
}
