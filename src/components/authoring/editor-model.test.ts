import { describe, expect, it } from 'vitest'

import {
  buildEditorOutline,
  buildMarkdownOutline,
  countEditorWords,
  getMarkdownHeadingIndexAtOffset,
  getReadingTimeMinutes,
  getSaveStateLabel,
} from './editor-model'

describe('editor model metrics', () => {
  it('counts CJK characters and Latin words without double counting', () => {
    expect(countEditorWords('发布一个专业 CMS editor with 2 rails')).toBe(11)
  })

  it('returns a useful minimum reading time for short and long documents', () => {
    expect(getReadingTimeMinutes('短文')).toBe(1)
    expect(getReadingTimeMinutes('word '.repeat(450))).toBe(2)
  })
})

describe('editor outline', () => {
  it('extracts heading hierarchy and stable ids from a Tiptap document', () => {
    expect(buildEditorOutline({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '概览' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '编辑器' }] },
      ],
    })).toEqual([
      { id: 'heading-1', level: 2, text: '概览', position: 0 },
      { id: 'heading-2', level: 3, text: '编辑器', position: 1 },
    ])
  })

  it('extracts Markdown heading levels without treating fenced code as structure', () => {
    expect(buildMarkdownOutline('# 标题\n\n```md\n## 代码示例\n```\n\n### 继续')).toEqual([
      { id: 'heading-1', level: 1, text: '标题', position: 0 },
      { id: 'heading-2', level: 3, text: '继续', position: 1 },
    ])
  })

  it('tracks the nearest Markdown heading for a source cursor', () => {
    const markdown = '# 第一章\n\n正文\n\n## 第二章\n\n更多内容'
    expect(getMarkdownHeadingIndexAtOffset(markdown, markdown.indexOf('正文'))).toBe(0)
    expect(getMarkdownHeadingIndexAtOffset(markdown, markdown.indexOf('更多内容'))).toBe(1)
    expect(getMarkdownHeadingIndexAtOffset('开头\n\n# 标题', 2)).toBeNull()
  })
})

describe('save state labels', () => {
  it('keeps save feedback explicit', () => {
    expect(getSaveStateLabel('idle')).toBe('未保存')
    expect(getSaveStateLabel('saving')).toBe('保存中')
    expect(getSaveStateLabel('saved')).toBe('已保存')
    expect(getSaveStateLabel('error')).toBe('保存失败')
  })
})
