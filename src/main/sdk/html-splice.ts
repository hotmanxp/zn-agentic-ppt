export function spliceSlide(html: string, slideId: string, newSection: string): string {
  // Match the entire <section ... data-id="ID" ...>...</section> block
  const re = new RegExp(
    `<section([^>]*)data-id=["']${slideId}["']([^>]*)>([\\s\\S]*?)</section>`,
    "i",
  );
  if (!re.test(html)) return html;
  return html.replace(re, newSection);
}

export function findSlideIds(html: string): string[] {
  const ids: string[] = [];
  const re = /<section[^>]*data-id=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.push(m[1]);
  return ids;
}
