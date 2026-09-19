import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const editorSource = readFileSync(new URL('./article-editor.tsx', import.meta.url), 'utf8')
const composerSource = readFileSync(new URL('../../app/wonderland/questions/[slug]/discussion-actions.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('wonderland answer editor modes', () => {
  it('defaults answers to simple mode and exposes an accessible two-mode switch', () => {
    expect(composerSource).toContain('useState<\'professional\' | \'simple\'>(\'simple\')')
    expect(composerSource).toContain('aria-label="回答编辑模式"')
    expect(composerSource).toContain('disallowEmptySelection')
    expect(composerSource).toContain('mode={editorMode}')
  })

  it('keeps the shared article editor professional by default for existing callers', () => {
    expect(editorSource).toContain('mode = \'professional\'')
    expect(editorSource).toContain('data-editor-mode={editorMode}')
    expect(editorSource).toContain('editorMode === \'simple\' ? \'is-simple\' : \'\'')
  })

  it('gives simple mode a compact mobile-safe canvas', () => {
    expect(stylesSource).toContain('.wonderland-article-editor.is-simple')
    expect(stylesSource).toContain('min-height: clamp(11rem, 24dvh, 15rem)')
    expect(stylesSource).toContain('min-height: clamp(10rem, 23dvh, 13rem)')
    expect(stylesSource).toContain('.wonderland-answer-composer-footer > button')
  })
})
