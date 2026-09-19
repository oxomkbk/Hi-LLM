import { describe, expect, it } from 'vitest'

import {
  insertProtectedMarkdownAtSelection,
  inspectMarkdownCompatibility,
  resolveMarkdownLengthEdit,
} from './markdown-editor'

import type { Editor } from '@tiptap/react'

describe('markdown editor source protection', () => {
  it('keeps GFM media and structure available in the visual editor', () => {
    const result = inspectMarkdownCompatibility(`
![封面](https://example.com/cover.png)

| 名称 | 状态 |
| --- | --- |
| 检查 | 完成 |

- [x] 已完成

<details><summary>更多</summary></details>
`)

    expect(result.features).toEqual(['html'])
    expect(result.requiresSource).toBe(true)
  })

  it('allows images, tables, and task lists to round-trip visually', () => {
    const result = inspectMarkdownCompatibility(`
![封面](https://example.com/cover.png)

| 名称 | 状态 |
| --- | --- |
| 检查 | 完成 |

- [x] 已完成
`)

    expect(result.features).toEqual([])
    expect(result.requiresSource).toBe(false)
  })

  it('does not mistake code samples or Markdown autolinks for raw content', () => {
    const result = inspectMarkdownCompatibility(`
\`![示例](image.png)\`

\`\`\`markdown
| A | B |
| --- | --- |
- [ ] 示例
<script>alert('example')</script>
\`\`\`

<https://example.com>
`)

    expect(result.features).toEqual([])
    expect(result.requiresSource).toBe(false)
  })

  it('protects heading levels while allowing GFM strikethrough in the visual schema', () => {
    const result = inspectMarkdownCompatibility(`# 一级标题

~~已废弃内容~~

##### 五级标题`)

    expect(result.features).toEqual(['heading'])
    expect(result.labels).toEqual(['五、六级或 Setext 标题'])
    expect(result.requiresSource).toBe(true)
  })

  it('allows a level-one heading in the visual editor', () => {
    expect(inspectMarkdownCompatibility('# 一级标题\n\n正文')).toEqual({ features: [], labels: [], requiresSource: false })
  })

  it('inserts protected Markdown at the visual selection instead of appending it', () => {
    const placeholder = 'HILLMNAVPROTECTEDPASTETOKEN'
    const editor = {
      getMarkdown: () => 'before after',
      markdown: { serialize: () => `before ${placeholder}after` },
      state: {
        schema: { text: (value: string) => value },
        selection: { from: 8, to: 8 },
        tr: { replaceWith: () => ({ doc: { toJSON: () => ({}) } }) },
      },
    } as unknown as Editor

    expect(insertProtectedMarkdownAtSelection(editor, '| A | B |')).toEqual({
      cursor: 7 + '| A | B |'.length,
      value: 'before | A | B |after',
    })
  })
})

describe('markdown editor length recovery', () => {
  it('allows an oversized existing document to be shortened incrementally', () => {
    expect(resolveMarkdownLengthEdit('123456', '12345', 4)).toEqual({ accepted: true, value: '12345' })
    expect(resolveMarkdownLengthEdit('12345', '1234', 4)).toEqual({ accepted: true, value: '1234' })
  })

  it('rejects growth while the document is over the limit', () => {
    expect(resolveMarkdownLengthEdit('12345', '123456', 4)).toEqual({ accepted: false, value: '12345' })
    expect(resolveMarkdownLengthEdit('1234', '12345', 4)).toEqual({ accepted: false, value: '1234' })
  })
})
