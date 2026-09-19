import { describe, expect, it } from 'vitest'

import { normalizeWonderlandDocument, plainTextDocument, wonderlandDocumentText } from './content'

const FILE_A = '11111111-1111-4111-8111-111111111111'

describe('wonderland structured content', () => {
  it('normalizes supported nodes and extracts text and file references', () => {
    const result = normalizeWonderlandDocument({
      content: [
        { content: [{ marks: [{ type: 'bold' }, { color: 'accent', type: 'color' }, { size: 'large', type: 'textSize' }], text: '怎样设计大型问答系统？', type: 'text' }], level: 2, type: 'heading' },
        { content: [{ marks: [{ href: 'https://example.com/docs', type: 'link' }], text: '需要先定义领域边界。', type: 'text' }], type: 'paragraph' },
        { alt: '架构图', caption: '领域边界', fileId: FILE_A, type: 'image' },
      ],
      schema: 'wonderland-document',
      version: 1,
    }, { minTextLength: 10 })

    expect(result.fileIds).toEqual([FILE_A])
    expect(result.text).toContain('需要先定义领域边界')
    expect(result.document.content).toHaveLength(3)
  })

  it('rejects HTML, unsafe links, duplicate images and excessive depth', () => {
    expect(() => normalizeWonderlandDocument({ content: [{ html: '<script />', type: 'html' }], schema: 'wonderland-document', version: 1 }))
      .toThrow('正文包含不支持的内容')
    expect(() => normalizeWonderlandDocument({
      content: [{ content: [{ marks: [{ href: 'javascript:alert(1)', type: 'link' }], text: 'unsafe', type: 'text' }], type: 'paragraph' }],
      schema: 'wonderland-document',
      version: 1,
    }))
      .toThrow('正文链接无效')
    expect(() => normalizeWonderlandDocument({
      content: [
        { alt: '', caption: '', fileId: FILE_A, type: 'image' },
        { alt: '', caption: '', fileId: FILE_A, type: 'image' },
        { content: [{ text: 'enough text', type: 'text' }], type: 'paragraph' },
      ],
      schema: 'wonderland-document',
      version: 1,
    }))
      .toThrow('同一张图片不能重复插入正文')
  })

  it('creates a safe plain text document', () => {
    expect(plainTextDocument('第一段').content[0]).toEqual({
      content: [{ text: '第一段', type: 'text' }],
      type: 'paragraph',
    })
    expect(wonderlandDocumentText(plainTextDocument('第一段'))).toBe('第一段')
  })

  it('rejects arbitrary colors and text sizes', () => {
    expect(() => normalizeWonderlandDocument({
      content: [{ content: [{ marks: [{ color: 'expression(alert(1))', type: 'color' }], text: 'unsafe', type: 'text' }], type: 'paragraph' }],
      schema: 'wonderland-document',
      version: 1,
    }))
      .toThrow('正文包含不支持的内容')
  })
})
