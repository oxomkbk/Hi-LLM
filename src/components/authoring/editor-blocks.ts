import type { JSONContent } from '@tiptap/react'

export type EditorBlockType = 'code' | 'divider' | 'heading' | 'image' | 'list' | 'paragraph' | 'quote'

/**
 * Payloads shared by the visual and Markdown block insertion controls.
 * Keeping this outside the React component module prevents the rail from
 * becoming a source of hidden, editor-specific insertion semantics.
 */
export function getEditorBlockInsertion(type: EditorBlockType): { markdown: string, node: JSONContent } {
  switch (type) {
    case 'heading':
      return {
        markdown: '## 新标题\n\n',
        node: { attrs: { level: 2 }, content: [{ text: '新标题', type: 'text' }], type: 'heading' },
      }
    case 'paragraph':
      return {
        markdown: '新段落…\n\n',
        node: { content: [{ text: '新段落…', type: 'text' }], type: 'paragraph' },
      }
    case 'quote':
      return {
        markdown: '> 引用内容\n\n',
        node: { content: [{ content: [{ text: '引用内容', type: 'text' }], type: 'paragraph' }], type: 'blockquote' },
      }
    case 'list':
      return {
        markdown: '- 列表项\n- 列表项\n\n',
        node: {
          content: [
            { content: [{ content: [{ text: '列表项', type: 'text' }], type: 'paragraph' }], type: 'listItem' },
            { content: [{ content: [{ text: '列表项', type: 'text' }], type: 'paragraph' }], type: 'listItem' },
          ],
          type: 'bulletList',
        },
      }
    case 'code':
      return {
        markdown: '```\n代码\n```\n\n',
        node: { attrs: { language: 'plaintext' }, content: [{ text: '代码', type: 'text' }], type: 'codeBlock' },
      }
    case 'divider':
      return {
        markdown: '---\n\n',
        node: { type: 'horizontalRule' },
      }
    case 'image':
      return {
        markdown: '',
        node: { type: 'image' },
      }
  }
}
