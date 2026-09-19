import { describe, expect, it } from 'vitest'

import { inferPromptEntry, normalizeArchivePath, sanitizePreviewHtml } from './package-parser'

describe('prompt package parser boundaries', () => {
  it('rejects traversal and absolute paths', () => {
    expect(() => normalizeArchivePath('../secret.txt')).toThrow('不安全路径')
    expect(() => normalizeArchivePath('/etc/passwd')).toThrow('不安全路径')
    expect(() => normalizeArchivePath('assets//cover.png')).toThrow('不安全路径')
  })

  it('recognizes prompt, readme, style, image, video and preview files', () => {
    expect(inferPromptEntry('prompts/main.md', 10)?.role).toBe('prompt')
    expect(inferPromptEntry('README.md', 10)?.role).toBe('readme')
    expect(inferPromptEntry('styles/theme.css', 10)?.role).toBe('style')
    expect(inferPromptEntry('assets/cover.webp', 10)?.role).toBe('cover')
    expect(inferPromptEntry('assets/demo.mp4', 10)?.role).toBe('video')
    expect(inferPromptEntry('preview/index.html', 10)?.role).toBe('web_preview')
  })

  it('removes active content and external preview URLs', () => {
    const output = sanitizePreviewHtml('<script>alert(1)</script><img src="https://tracker.test/a.png"><a href="javascript:alert(2)">x</a><style>@import "https://evil.test/x.css";</style>')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('https://')
    expect(output).not.toContain('javascript:')
    expect(output).not.toContain('@import')
  })
})
