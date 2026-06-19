import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
// @ts-ignore vendor bundle — no types
import { tool, createSdkMcpServer } from '../../../vendor/sdk.mjs'

export interface SlideMcpContext {
  projectDir: string
  onSlideUpdated?: (slideId: string, content: string) => void
}

/**
 * In-process MCP server exposing per-slide file ops:
 *   - read_slide_file(slideId):  read current slides/<id>.html
 *   - write_slide_file(slideId, content): overwrite whole file
 *   - update_slide_file(slideId, oldText, newText): replace substring
 *
 * Passed to sdkQuery via options.mcpServers. The LLM uses these to
 * edit slide files directly instead of returning HTML in chat.
 */
export function buildSlideMcpServer(ctx: SlideMcpContext) {
  const { projectDir, onSlideUpdated } = ctx
  const slidePath = (slideId: string) => {
    const safe = String(slideId).replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(projectDir, 'slides', `${safe}.html`)
  }
  const ensureDir = async () => mkdir(join(projectDir, 'slides'), { recursive: true })

  return createSdkMcpServer({
    type: 'sdk',
    name: 'slides',
    tools: [
      tool(
        'read_slide_file',
        'Read the current HTML content of slides/<slideId>.html. Returns the file contents as a string (empty string if the file does not exist).',
        { slideId: 'string' },
        async (args: { slideId: string }) => {
          let content = ''
          try { content = await readFile(slidePath(args.slideId), 'utf8') } catch {}
          return { content: [{ type: 'text', text: content }] }
        },
      ),
      tool(
        'write_slide_file',
        'Overwrite slides/<slideId>.html with the given content. The content should be a single <section data-id="<slideId>">...</section> block. No <html>/<head>/<body> wrappers.',
        { slideId: 'string', content: 'string' },
        async (args: { slideId: string; content: string }) => {
          await ensureDir()
          const content = String(args.content)
          await writeFile(slidePath(args.slideId), content, 'utf8')
          onSlideUpdated?.(args.slideId, content)
          return { content: [{ type: 'text', text: `Wrote slides/${args.slideId}.html (${content.length} chars)` }] }
        },
      ),
      tool(
        'update_slide_file',
        'Replace a substring in slides/<slideId>.html. Reads the current file, replaces the first occurrence of `oldText` with `newText`, writes back. Returns the new full file contents.',
        { slideId: 'string', oldText: 'string', newText: 'string' },
        async (args: { slideId: string; oldText: string; newText: string }) => {
          let current = ''
          try { current = await readFile(slidePath(args.slideId), 'utf8') } catch {}
          if (!current.includes(args.oldText)) {
            return { content: [{ type: 'text', text: `Error: oldText not found in slides/${args.slideId}.html` }], isError: true }
          }
          const updated = current.replace(args.oldText, args.newText)
          await ensureDir()
          await writeFile(slidePath(args.slideId), updated, 'utf8')
          onSlideUpdated?.(args.slideId, updated)
          return { content: [{ type: 'text', text: `Updated slides/${args.slideId}.html (${updated.length} chars)` }] }
        },
      ),
    ],
  })
}
