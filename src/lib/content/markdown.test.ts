import { describe, expect, it } from 'vitest'

import { inspectMarkdownImages, looksLikeMarkdown, markdownPlainText, sanitizeMarkdownForRichEditor } from './markdown'

describe('markdown content helpers', () => {
  it('detects structured Markdown without treating ordinary sentences as Markdown', () => {
    expect(looksLikeMarkdown('## 安装\n\n- 第一步\n- 第二步')).toBe(true)
    expect(looksLikeMarkdown('复制 **粗体内容** 和 `code`')).toBe(true)
    expect(looksLikeMarkdown('这是一段普通的产品说明。')).toBe(false)
  })

  it('extracts readable plain text for validation and summaries', () => {
    expect(markdownPlainText('## 标题\n\n[文档](https://example.com) 与 **说明**')).toBe('标题\n\n文档 与 说明')
  })

  it('keeps uploaded images and converts remote Markdown images into safe links', () => {
    const fileId = '4c93472f-90a8-4bfe-a3c4-95e257b412fc'
    const result = sanitizeMarkdownForRichEditor(`![本地](/api/files/${fileId})\n![远程](https://example.com/demo.png)\n![危险](javascript:alert)`)

    expect(result.externalImages).toBe(2)
    expect(result.markdown).toContain(`![本地](/api/files/${fileId})`)
    expect(result.markdown).toContain('[图片：远程](https://example.com/demo.png)')
    expect(result.markdown).toContain('图片：危险')
    expect(result.markdown).not.toContain('javascript:')
  })

  it('separates uploaded file references from external Markdown images', () => {
    const fileId = '4c93472f-90a8-4bfe-a3c4-95e257b412fc'
    expect(inspectMarkdownImages(`![a](/api/files/${fileId})\n![b](https://example.com/b.png)`)).toEqual({
      externalImages: 1,
      fileIds: [fileId],
    })
  })
})
