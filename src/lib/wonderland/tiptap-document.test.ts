import { describe, expect, it } from 'vitest'

import { tiptapToWonderlandDocument, wonderlandToTiptapDocument } from './tiptap-document'

import type { WonderlandDocument } from './content'

const imageId = '123e4567-e89b-42d3-a456-426614174000'

describe('wonderland Tiptap document adapter', () => {
  it('round-trips supported article content without HTML', () => {
    const document: WonderlandDocument = {
      content: [
        { content: [{ marks: [{ type: 'bold' }, { href: 'https://example.com/', type: 'link' }, { color: 'blue', type: 'color' }, { color: 'yellow', type: 'backgroundColor' }, { size: 'large', type: 'textSize' }], text: '正文', type: 'text' }], level: 2, type: 'heading' },
        { content: [{ content: [{ content: [{ text: '列表项', type: 'text' }], type: 'paragraph' }], type: 'listItem' }], type: 'bulletList' },
        { alt: '示例图', caption: '图片说明', fileId: imageId, type: 'image' },
      ],
      schema: 'wonderland-document',
      version: 1,
    }

    expect(tiptapToWonderlandDocument(wonderlandToTiptapDocument(document))).toEqual(document)
  })

  it('drops external image sources', () => {
    expect(tiptapToWonderlandDocument({
      content: [{ attrs: { src: 'https://example.com/image.png' }, type: 'image' }],
      type: 'doc',
    }).content).toEqual([])
  })

  it('round-trips task lists, tables, alignment and extended text marks', () => {
    const document: WonderlandDocument = {
      content: [
        {
          align: 'center',
          content: [{ marks: [{ type: 'underline' }, { type: 'strike' }, { type: 'highlight' }], text: '发布检查', type: 'text' }],
          type: 'paragraph',
        },
        {
          content: [
            { checked: false, content: [{ content: [{ text: '补充示例', type: 'text' }], type: 'paragraph' }], type: 'taskItem' },
            { checked: true, content: [{ content: [{ text: '完成说明', type: 'text' }], type: 'paragraph' }], type: 'taskItem' },
          ],
          type: 'taskList',
        },
        {
          rows: [
            {
              cells: [
                { content: [{ content: [{ text: '名称', type: 'text' }], type: 'paragraph' }], type: 'tableHeader' },
                { content: [{ content: [{ text: '状态', type: 'text' }], type: 'paragraph' }], type: 'tableHeader' },
              ],
              type: 'tableRow',
            },
          ],
          type: 'table',
        },
      ],
      schema: 'wonderland-document',
      version: 1,
    }

    expect(tiptapToWonderlandDocument(wonderlandToTiptapDocument(document))).toEqual(document)
  })
})
