import { describe, expect, it } from 'vitest'

import { subsetTerminologyPreviewCss } from './terminology-preview-css-subset'

describe('terminology preview CSS subset', () => {
  it('keeps only rules referenced by the current preview HTML', () => {
    const css = [
      '.preview-root .shared{display:flex}',
      '.preview-root .used[data-name="demo"]{color:var(--preview-text)}',
      '.preview-root .unused{display:grid}',
      '@media (prefers-reduced-motion: reduce){.preview-root .used{transform:none}.preview-root .unused{transform:none}}',
    ].join('')
    const subset = subsetTerminologyPreviewCss(css, [{ html: '<div class="shared used" data-name="demo">预览</div>' }])

    expect(subset).toContain('.preview-root .shared')
    expect(subset).toContain('.preview-root .used[data-name="demo"]')
    expect(subset).not.toContain('.unused')
  })

  it('removes an empty media rule', () => {
    const css = '@media (prefers-reduced-motion: reduce){.preview-root .unused{transform:none}}'
    expect(subsetTerminologyPreviewCss(css, [{ html: '<div class="used">预览</div>' }])).toBe('')
  })
})
