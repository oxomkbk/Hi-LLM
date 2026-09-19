import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearWonderlandDraft, loadWonderlandDraft, saveWonderlandDraft } from './wonderland-drafts'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const storage = new MemoryStorage()
const document = {
  content: [{ content: [{ text: '足够清晰的问题正文', type: 'text' as const }], type: 'paragraph' as const }],
  schema: 'wonderland-document' as const,
  version: 1 as const,
}

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('wonderland guest drafts', () => {
  it('restores a validated structured question draft', () => {
    expect(saveWonderlandDraft({
      body: document,
      categoryId: 'category-id',
      kind: 'question',
      summary: '问题摘要',
      targetId: 'new',
      title: '问题标题',
    })).toBe(true)
    expect(loadWonderlandDraft('question', 'new')).toMatchObject({
      body: document,
      categoryId: 'category-id',
      kind: 'question',
      targetId: 'new',
      title: '问题标题',
    })
    expect(loadWonderlandDraft('answer', 'new')).toBeNull()
    expect(clearWonderlandDraft('question', 'new')).toBe(true)
    expect(loadWonderlandDraft('question', 'new')).toBeNull()
  })

  it('preserves up to eight uploaded images in question and answer drafts', () => {
    const images = Array.from({ length: 8 }, (_, index) => ({
      alt: `image-${index}`,
      caption: '',
      fileId: `c53b8134-1935-42ca-9c28-b4c10fd532f${index}`,
      type: 'image' as const,
    }))
    const body = { content: images, schema: 'wonderland-document' as const, version: 1 as const }

    expect(saveWonderlandDraft({ body, kind: 'answer', targetId: 'question-id' })).toBe(true)
    expect(loadWonderlandDraft('answer', 'question-id')).toMatchObject({ body })
    expect(saveWonderlandDraft({ body, kind: 'question', targetId: 'new', title: '带截图的问题' })).toBe(true)
    expect(loadWonderlandDraft('question', 'new')).toMatchObject({ body })

    expect(saveWonderlandDraft({
      body: {
        ...body,
        content: [...images, { alt: 'ninth', caption: '', fileId: 'c53b8134-1935-42ca-9c28-b4c10fd532f8', type: 'image' }],
      },
      kind: 'answer',
      targetId: 'too-many-images',
    })).toBe(false)
  })

  it('restores the external links, cover and metadata in a work draft', () => {
    expect(saveWonderlandDraft({
      body: document,
      coverFileId: 'c53b8134-1935-42ca-9c28-b4c10fd532f2',
      demoUrl: 'https://example.com/demo',
      kind: 'work',
      sourceUrl: 'https://github.com/example/project',
      summary: '一个可以公开展示的代码作品',
      tags: ['Next.js', '开源'],
      targetId: 'new',
      title: '社区作品',
      workKind: 'app',
    })).toBe(true)
    expect(loadWonderlandDraft('work', 'new')).toMatchObject({
      coverFileId: 'c53b8134-1935-42ca-9c28-b4c10fd532f2',
      demoUrl: 'https://example.com/demo',
      kind: 'work',
      sourceUrl: 'https://github.com/example/project',
      tags: ['Next.js', '开源'],
      title: '社区作品',
      workKind: 'app',
    })
  })

  it('sanitizes comment markdown and rejects local file images', () => {
    expect(saveWonderlandDraft({ body: '普通 **Markdown**', kind: 'comment', targetId: 'news:1' })).toBe(true)
    expect(loadWonderlandDraft('comment', 'news:1')).toMatchObject({ body: '普通 **Markdown**' })
    expect(saveWonderlandDraft({
      body: '![image](/api/files/c53b8134-1935-42ca-9c28-b4c10fd532f2)',
      kind: 'comment',
      targetId: 'news:2',
    })).toBe(false)
  })

  it('returns safe failures when browser storage methods throw', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => { throw new Error('blocked') },
          removeItem: () => { throw new Error('blocked') },
          setItem: () => { throw new Error('blocked') },
        },
      },
    })

    expect(loadWonderlandDraft('question', 'new')).toBeNull()
    expect(saveWonderlandDraft({ body: document, kind: 'question', targetId: 'new' })).toBe(false)
    expect(clearWonderlandDraft('question', 'new')).toBe(false)
  })
})
