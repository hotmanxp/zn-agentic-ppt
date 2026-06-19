export function buildOutlinePrompt(topic: string, source: string): string {
  return `你是 PPT 大纲编辑。用户会给你原始内容（文章、笔记、要点）。
请把它结构化成 4-8 张幻灯片的大纲，每页包含：
- title: 标题（≤20 字）
- bullets: 要点数组（2-5 项，每项 ≤30 字）
- notes: 可选，补充说明（≤50 字）

输出 JSON 格式：{ "slides": [...] }。不要解释，直接输出。

用户主题：${topic}

用户原始内容：
${source}`
}
