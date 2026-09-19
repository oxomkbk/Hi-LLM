import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EditorStudio, EditorStudioSection } from './editor-studio'

describe('editorStudio', () => {
  it('renders the reference top bar and three-pane workspace as one application shell', () => {
    const html = renderToStaticMarkup(
      <EditorStudio
        actions={<button type="button">发布</button>}
        backHref="/prompts"
        completion={{ completed: 2, total: 4 }}
        documentLabel="未命名 Prompt"
        inspector={(
          <label>
            分类
            <input />
          </label>
        )}
        inspectorFooter={<button type="button">保存草稿</button>}
        leftRail={<nav>大纲与区块</nav>}
        statusLabel="已保存"
      >
        <article>正文画布</article>
      </EditorStudio>,
    )

    expect(html).toContain('data-editor-studio="true"')
    expect(html).toContain('data-editor-studio-mode="three-pane"')
    expect(html).toContain('data-editor-studio-region="inspector"')
    expect(html).toContain('data-editor-studio-topbar="true"')
    expect(html).toContain('data-editor-studio-layout="true"')
    expect(html).toContain('aria-label="文档结构与区块"')
    expect(html).toContain('aria-label="文档编辑区"')
    expect(html).toContain('aria-label="发布设置"')
    expect(html).toContain('2/4 完成')
    expect(html).not.toContain('composer-page-header')
    expect(html).not.toContain('authoring-stage-switch')
  })

  it('keeps the document identity area outside the rich-text body', () => {
    const html = renderToStaticMarkup(
      <EditorStudio
        backHref="/prompts"
        documentHeader={<header data-testid="document-identity">标题与摘要</header>}
        documentLabel="文章"
        inspector={<div />}
        leftRail={<nav />}
      >
        <div data-testid="rich-text-body">正文</div>
      </EditorStudio>,
    )

    expect(html.indexOf('document-identity')).toBeLessThan(html.indexOf('rich-text-body'))
    expect(html).toContain('documentIdentity')
    expect(html).toContain('editorBody')
  })

  it('renders document metadata in the application top bar instead of the canvas', () => {
    const html = renderToStaticMarkup(
      <EditorStudio
        backHref="/prompts"
        documentLabel="文章"
        documentMeta={<span data-testid="document-meta">Hi LLM · 1 分钟阅读 · 6 字</span>}
        inspector={<div />}
        leftRail={<nav />}
      >
        <div data-testid="rich-text-body">正文</div>
      </EditorStudio>,
    )

    const metaIndex = html.indexOf('document-meta')
    const layoutIndex = html.indexOf('data-editor-studio-layout')
    expect(metaIndex).toBeGreaterThan(-1)
    expect(metaIndex).toBeLessThan(layoutIndex)
  })

  it('supports progressive disclosure for page-specific inspector sections', () => {
    const html = renderToStaticMarkup(
      <EditorStudioSection title="高级设置" defaultOpen={false}>
        <input aria-label="高级设置" />
      </EditorStudioSection>,
    )

    expect(html).toContain('<details')
    expect(html).not.toContain(' open')
    expect(html).toContain('高级设置')
  })
})
