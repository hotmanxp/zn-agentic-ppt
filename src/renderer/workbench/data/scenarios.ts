import type { Scenario } from "./types.js";

export const SCENARIOS: Scenario[] = [
  {
    id: "sales",
    name: "商机与售前材料",
    body: "客户拜访、需求探索与解决方案",
    audience: "培训负责人、业务负责人、采购相关人",
    goal: "讲清价值并推动后续方案演示或商务沟通",
    duration: "20 分钟",
    pages: "10 页",
  },
  {
    id: "launch",
    name: "发布会演讲稿",
    body: "发布知鸟新品与能力亮点",
    audience: "客户、合作伙伴与内部业务团队",
    goal: "清晰传达新品价值并引导会后体验或咨询",
    duration: "20 分钟",
    pages: "10 页",
  },
  {
    id: "internal",
    name: "内部工作汇报",
    body: "梳理进展、问题与决策事项",
    audience: "管理层与项目核心干系人",
    goal: "同步进展、暴露风险并推动关键决策",
    duration: "20 分钟",
    pages: "10 页",
  },
];
