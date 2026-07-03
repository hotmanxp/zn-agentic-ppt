export interface ExecutionStep {
  id: string
  title: string
  detail: string
}

// User-facing copy for the generation progress card. Sourced from the prototype;
// intentionally NOT derived from PROMPT_SPECS (would over-expose internals to a
// non-developer audience).
export const EXECUTION_STEPS: ExecutionStep[] = [
  { id: 'intent', title: '理解任务与受众', detail: '提炼客户、场景、目标和讲述约束' },
  { id: 'search', title: '检索并校验企业知识', detail: '只使用有权限、在有效期内的知识版本' },
  { id: 'outline', title: '搭建演示叙事', detail: '按确认的时长节奏组织大纲结构' },
  { id: 'compose', title: '生成页面与讲述提示', detail: '匹配企业模板并压缩页面信息密度' },
  { id: 'verify', title: '检查引用与可对外范围', detail: '逐页校验事实、版本和引用位置' },
]