import { describe, expect, it, vi } from 'vitest'

import { PROMPT_GLOSSARY_KIND, PROMPT_GLOSSARY_SCHEMA_VERSION } from './glossary'
import { parseAndValidateGlossaryPreviewBundle, validateGlossaryPreviewCss, validateGlossaryPreviewHtml } from './glossary-preview-security'

import type { PromptGlossaryDocument } from './glossary'
import type { PromptDocumentInput } from '@/types'

vi.mock('server-only', () => ({}))

const glossary: PromptGlossaryDocument = {
  intro: '说明',
  kind: PROMPT_GLOSSARY_KIND,
  schemaVersion: PROMPT_GLOSSARY_SCHEMA_VERSION,
  sections: [{
    description: '分组说明',
    id: 'basic',
    items: [{ aliases: [], description: '表格说明', id: 'table', label: '表格', prompt: '整理成表格', term: 'Table' }],
    order: 1,
    title: '基础',
  }],
}

const css = '.preview-root .demo{display:flex;color:var(--preview-text);gap:8px;padding:12px;border:1px solid var(--preview-border)}'

function documents(html = '<div class="demo" data-name="table"><span>项目</span><strong>已完成</strong></div>', style = css): PromptDocumentInput[] {
  return [
    {
      content: JSON.stringify({ schemaVersion: 1, items: [{ termId: 'table', summary: '按行列展示项目状态', html }] }),
      isPrimary: false,
      language: 'prompt-glossary-preview+json',
      name: '术语预览',
      role: 'example',
      sourcePath: 'PREVIEWS.json',
    },
    {
      content: style,
      isPrimary: false,
      language: 'css',
      name: '术语预览样式',
      role: 'style',
      sourcePath: 'styles/glossary-preview.css',
    },
  ]
}

describe('glossary preview security', () => {
  it('accepts a complete, scoped, display-only preview bundle', () => {
    const result = parseAndValidateGlossaryPreviewBundle(documents(), glossary, { requireComplete: true })
    expect(result?.items.table?.summary).toBe('按行列展示项目状态')
    expect(result?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">打开</a>',
    '<svg><animate onbegin=alert(1) /></svg>',
    '<div style="background:url(https://example.com/a)">外链</div>',
    '<form><input name="secret"></form>',
  ])('rejects active HTML: %s', (html) => {
    expect(() => validateGlossaryPreviewHtml(html)).toThrow()
  })

  it.each([
    '@import "https://example.com/a.css";',
    '.demo{color:red}',
    '.preview-root{background-image:url(https://example.com/a)}',
    '#app .demo{display:flex}',
    '.preview-root a:visited{color:var(--preview-text)}',
    '.preview-root .demo{position:fixed}',
    '.preview-root .demo{opacity:0}',
    '.preview-root .demo{color:expression(alert(1))}',
    '.preview-root .demo{display:block!important}',
    '.preview-root .demo{/* hidden */display:block}',
  ])('rejects unsafe CSS: %s', (style) => {
    expect(() => validateGlossaryPreviewCss(style)).toThrow()
  })

  it('rejects missing, duplicate, unknown, branded, and external content', () => {
    expect(() => parseAndValidateGlossaryPreviewBundle(documents(), { ...glossary, sections: [] }, { requireComplete: true })).toThrow('未知术语')
    const duplicated = documents()
    duplicated[0]!.content = JSON.stringify({ schemaVersion: 1, items: [
      { termId: 'table', summary: '一个', html: '<div class="demo">一个</div>' },
      { termId: 'table', summary: '两个', html: '<div class="demo">两个</div>' },
    ] })
    expect(() => parseAndValidateGlossaryPreviewBundle(duplicated, glossary)).toThrow('重复')
    expect(() => parseAndValidateGlossaryPreviewBundle(documents('<div class="demo">https://example.com</div>'), glossary)).toThrow('外部地址')
  })
})
