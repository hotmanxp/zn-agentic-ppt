export interface ProcessStep {
  title: string
  detail: string
}

export const SOURCE_SEARCH_STEPS: ProcessStep[] = [
  { title: '理解资料范围', detail: '根据客户、听众和目标确定检索关键词' },
  { title: '检索企业知识库', detail: '匹配方案、行业材料、案例和访谈纪要' },
  { title: '校验版本与权限', detail: '过滤过期、不可对外或权限不足的内容' },
  { title: '整理候选资料', detail: '按相关性和可引用性生成资料清单' },
]