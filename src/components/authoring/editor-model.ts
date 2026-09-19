export interface EditorOutlineItem {
  id: string
  level: number
  position: number
  text: string
}

export type EditorSaveState = 'error' | 'idle' | 'saved' | 'saving'

const SAVE_STATE_LABELS: Record<EditorSaveState, string> = {
  error: '保存失败',
  idle: '未保存',
  saved: '已保存',
  saving: '保存中',
}

/**
 * Builds a shallow document map from a Tiptap JSON document. Positions are
 * indexes intentionally: consumers that need ProseMirror offsets can map the
 * item id to their live document without coupling this pure helper to Tiptap.
 */
export function buildEditorOutline(document: unknown): EditorOutlineItem[] {
  if (!isRecord(document) || !Array.isArray(document.content))
    return []

  const outline: EditorOutlineItem[] = []
  for (const node of document.content) {
    if (!isRecord(node) || node.type !== 'heading')
      continue
    const level = isRecord(node.attrs) && typeof node.attrs.level === 'number' ? node.attrs.level : 2
    const text = extractNodeText(node).trim()
    if (!text)
      continue
    const position = outline.length
    outline.push({
      id: `heading-${position + 1}`,
      level,
      position,
      text,
    })
  }
  return outline
}

export function buildMarkdownOutline(value: string): EditorOutlineItem[] {
  const outline: EditorOutlineItem[] = []
  let fenced = false
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (/^(?:`{3,}|~{3,})/.test(trimmed)) {
      fenced = !fenced
      continue
    }
    if (fenced)
      continue
    const match = /^(#{1,4})[ \t]/.exec(line)
    if (!match)
      continue
    const text = line.slice(match[0].length).replace(/[ \t]+#+[ \t]*$/, '').trim()
    if (!text)
      continue
    outline.push({
      id: `heading-${outline.length + 1}`,
      level: match[1].length,
      position: outline.length,
      text,
    })
  }
  return outline
}

/** Counts words in a way that feels natural for mixed Chinese/Latin writing. */
export function countEditorWords(value: string) {
  const normalized = value.trim()
  if (!normalized)
    return 0

  const latinWords = normalized.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
  const cjkCharacters = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []
  return latinWords.filter(word => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word)).length + cjkCharacters.length
}

/** Returns the nearest heading index before a Markdown cursor offset. */
export function getMarkdownHeadingIndexAtOffset(value: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, value.length))
  let fenced = false
  let headingIndex = 0
  let activeIndex: number | null = null
  let lineOffset = 0

  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (/^(?:`{3,}|~{3,})/.test(trimmed)) {
      fenced = !fenced
    }
    else if (!fenced && /^\s{0,3}#{1,4}[ \t]/.test(line) && lineOffset <= safeOffset) {
      activeIndex = headingIndex
      headingIndex += 1
    }
    lineOffset += line.length + 1
    if (lineOffset > safeOffset)
      break
  }

  return activeIndex
}

export function getReadingTimeMinutes(value: string) {
  return Math.max(1, Math.ceil(countEditorWords(value) / 400))
}

export function getSaveStateLabel(state: EditorSaveState) {
  return SAVE_STATE_LABELS[state]
}

function extractNodeText(node: Record<string, unknown>): string {
  if (typeof node.text === 'string')
    return node.text
  if (!Array.isArray(node.content))
    return ''
  return node.content.filter(isRecord).map(extractNodeText).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
