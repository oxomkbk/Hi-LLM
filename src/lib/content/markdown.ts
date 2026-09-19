export function looksLikeMarkdown(value: string) {
  const text = value.trim()
  if (text.length < 4)
    return false
  const lines = text.split('\n')
  const block = lines.some((line) => {
    const value = line.trimStart()
    return /^#{1,6}\s/.test(value)
      || /^[-*+]\s/.test(value)
      || /^\d{1,4}\.\s/.test(value)
      || value.startsWith('> ')
      || value.startsWith('```')
      || value.startsWith('~~~')
  })
  const inline = text.includes('**')
    || text.includes('__')
    || /`[^\n`]+`/.test(text)
    || /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/i.test(text)
  const table = lines.some((line, index) => line.includes('|') && isTableDivider(lines[index + 1]))
  return block || inline || table
}

export function markdownPlainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, block => block.replace(/^```[^\n]*\n?|```$/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|[>*+\-]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const INTERNAL_FILE_SOURCE = /^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export function inspectMarkdownImages(value: string) {
  const fileIds: string[] = []
  let externalImages = 0
  for (const match of value.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const fileId = INTERNAL_FILE_SOURCE.exec(match[2]!)?.[1]
    if (fileId)
      fileIds.push(fileId)
    else
      externalImages += 1
  }
  return { externalImages, fileIds }
}

/**
 * Rich content only persists uploaded files. Keep already-uploaded image URLs,
 * turn safe remote images into links, and strip unsafe protocols before TipTap
 * parses the Markdown so the editor preview always matches the saved document.
 */
export function sanitizeMarkdownForRichEditor(value: string) {
  let externalImages = 0
  const markdown = value.replace(MARKDOWN_IMAGE_PATTERN, (_match, alt: string, source: string) => {
    if (INTERNAL_FILE_SOURCE.test(source))
      return _match

    externalImages += 1
    const label = `图片：${alt.trim() || '外部图片'}`
    if (/^https?:\/\//i.test(source))
      return `[${label}](${source})`
    return label
  })

  return { externalImages, markdown }
}

function isTableDivider(line?: string) {
  if (!line || !line.includes('-'))
    return false
  const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}
