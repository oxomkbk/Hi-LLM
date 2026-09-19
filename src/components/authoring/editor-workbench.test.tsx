import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { getEditorBlockInsertion } from './editor-blocks'
import { EditorOutline } from './editor-workbench'

describe('editor studio rail', () => {
  it('exposes real block payloads for insert actions instead of only changing the current paragraph', () => {
    expect(getEditorBlockInsertion('heading')).toEqual({
      markdown: '## 新标题\n\n',
      node: { content: [{ text: '新标题', type: 'text' }], type: 'heading', attrs: { level: 2 } },
    })
    expect(getEditorBlockInsertion('paragraph')).toEqual({
      markdown: '新段落…\n\n',
      node: { content: [{ text: '新段落…', type: 'text' }], type: 'paragraph' },
    })
    expect(getEditorBlockInsertion('quote')).toEqual({
      markdown: '> 引用内容\n\n',
      node: { content: [{ content: [{ text: '引用内容', type: 'text' }], type: 'paragraph' }], type: 'blockquote' },
    })
  })

  it('renders the outline and block views when editing', () => {
    const html = renderToStaticMarkup(
      <EditorOutline
        items={[{ id: 'heading-1', level: 2, position: 0, text: '第一章' }]}
        onInsertBlock={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(html).toContain('大纲')
    expect(html).toContain('区块')
    expect(html).toContain('第一章')
    expect(html.match(/role="tab"/g)).toHaveLength(2)
  })

  it('keeps insertion controls out of read-only rails', () => {
    const html = renderToStaticMarkup(
      <EditorOutline items={[]} />,
    )

    expect(html).toContain('大纲')
    expect(html).not.toContain('区块')
    expect(html).not.toContain('上传图片')
  })
})
