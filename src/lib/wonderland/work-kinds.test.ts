import { describe, expect, it } from 'vitest'

describe('work kind labels', () => {
  it('presents stored kind values as administrator-friendly labels', async () => {
    const moduleUrl = new URL('./work-kinds.ts', import.meta.url).href
    const loaded = await import(/* @vite-ignore */ moduleUrl).catch(() => ({})) as {
      workKindLabel?: (kind: string) => string
    }

    expect(loaded.workKindLabel).toBeTypeOf('function')
    expect(loaded.workKindLabel?.('app')).toBe('应用')
    expect(loaded.workKindLabel?.('library')).toBe('开源库')
    expect(loaded.workKindLabel?.('template')).toBe('模板')
    expect(loaded.workKindLabel?.('future-kind')).toBe('future-kind')
  })
})
