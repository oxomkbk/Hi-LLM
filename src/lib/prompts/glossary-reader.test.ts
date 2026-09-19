import { describe, expect, it } from 'vitest'

import { filterPromptGlossary } from './glossary'
import {
  flattenPromptGlossary,
  movePromptGlossaryIndex,
  resolveActivePromptGlossaryIndex,
} from './glossary-reader'

import type { PromptGlossaryDocument } from './glossary'

const glossary: PromptGlossaryDocument = {
  intro: '用场景找到术语。',
  kind: 'development-terminology',
  schemaVersion: 1,
  sections: [
    {
      description: '界面基础',
      id: 'interface',
      items: [
        { aliases: ['界面'], description: '浏览器里看到的界面。', id: 'frontend', label: '前端', prompt: '调整前端界面。', term: 'Frontend' },
        { aliases: ['状态反馈'], description: '保存中的状态。', id: 'state', label: '状态', prompt: '增加保存状态。', term: 'State' },
      ],
      order: 0,
      title: '界面基础',
    },
    {
      description: '数据能力',
      id: 'data',
      items: [
        { aliases: ['接口'], description: '数据通信边界。', id: 'api', label: '接口', prompt: '保持接口不变。', term: 'API' },
      ],
      order: 1,
      title: '数据',
    },
  ],
}

describe('glossary reader navigation', () => {
  it('flattens the filtered order and falls back to the first visible item', () => {
    const visible = flattenPromptGlossary(filterPromptGlossary(glossary, '状态'))
    expect(visible.map(entry => entry.item.id)).toEqual(['state'])
    expect(resolveActivePromptGlossaryIndex(visible, 'frontend')).toBe(0)
  })

  it('uses search and section filters together', () => {
    expect(flattenPromptGlossary(filterPromptGlossary(glossary, '接口', 'interface'))).toEqual([])
    expect(flattenPromptGlossary(filterPromptGlossary(glossary, '接口', 'data')).map(entry => entry.item.id)).toEqual(['api'])
  })

  it('keeps keyboard navigation inside the filtered boundaries', () => {
    expect(movePromptGlossaryIndex(0, 3, 'ArrowLeft')).toBe(0)
    expect(movePromptGlossaryIndex(0, 3, 'ArrowDown')).toBe(1)
    expect(movePromptGlossaryIndex(1, 3, 'End')).toBe(2)
    expect(movePromptGlossaryIndex(2, 3, 'ArrowRight')).toBe(2)
    expect(movePromptGlossaryIndex(2, 3, 'Home')).toBe(0)
    expect(movePromptGlossaryIndex(0, 0, 'Home')).toBe(-1)
  })
})
