import type { ProcessStep } from './sourceSearchSteps.js'

export const OUTLINE_BUILD_STEPS: ProcessStep[] = [
  { title: '提炼核心观点', detail: '从已确认资料中抽取业务问题和价值主张' },
  { title: '组织讲述顺序', detail: '先建立场景共识，再进入能力、案例和建议' },
  { title: '匹配页数与时长', detail: '按汇报时长控制页面数量和信息密度' },
  { title: '生成可编辑大纲', detail: '保留引用来源，等待你确认后再生成 PPT' },
]