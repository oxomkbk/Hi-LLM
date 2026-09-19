import { describe, expect, it } from 'vitest'

async function loadPresentation() {
  const moduleUrl = new URL('./work-card-presentation.ts', import.meta.url).href
  return import(/* @vite-ignore */ moduleUrl).catch(() => ({})) as Promise<{
    hasVisibleEngagement?: (likes: number, views: number) => boolean
    visibleWorkTags?: (tags: string[]) => string[]
  }>
}

describe('work-card presentation', () => {
  it('keeps three useful tags and removes editorial markers', async () => {
    const presentation = await loadPresentation()

    expect(presentation.visibleWorkTags).toBeTypeOf('function')
    expect(presentation.visibleWorkTags?.(['开发工具', '跨平台', 'MIT', '开源免费', '隐私'])).toEqual([
      '开发工具',
      '跨平台',
      'MIT',
    ])
  })

  it('suppresses only an all-zero engagement cluster', async () => {
    const presentation = await loadPresentation()

    expect(presentation.hasVisibleEngagement).toBeTypeOf('function')
    expect(presentation.hasVisibleEngagement?.(0, 0)).toBe(false)
    expect(presentation.hasVisibleEngagement?.(2, 0)).toBe(true)
    expect(presentation.hasVisibleEngagement?.(0, 19)).toBe(true)
  })
})
