import { describe, expect, it } from 'vitest'

import {
  filterPromptGlossary,
  formatPromptGlossaryMarkdown,
  parsePromptGlossaryContent,
  promptGlossaryItemCount,
} from './glossary'

const validDocument = {
  intro: '把模糊需求翻译成准确的开发表达。',
  kind: 'development-terminology',
  schemaVersion: 1,
  sections: [
    {
      description: '页面中用户能看到并操作的部分。',
      id: 'web-basics',
      items: [
        {
          aliases: ['用户界面', '前台'],
          description: '运行在浏览器里、直接面向用户的界面层。',
          id: 'frontend',
          label: '前端',
          prompt: '请只调整前端展示与交互，不改动后端接口和数据库结构。',
          term: 'Frontend',
        },
        {
          aliases: ['组件化'],
          description: '把重复界面封装成可以复用和统一维护的单元。',
          id: 'component',
          label: '组件',
          prompt: '把重复出现的商品区域抽成可复用组件，并让所有实例共用同一套样式和行为。',
          term: 'Component',
        },
      ],
      order: 20,
      title: '网页基础',
    },
    {
      description: '页面数据在交互过程中的当前情况。',
      id: 'interaction-state',
      items: [
        {
          aliases: ['保存中'],
          description: '会影响界面渲染和用户反馈的当前数据。',
          id: 'state',
          label: '状态',
          prompt: '提交后立即进入保存中状态，成功与失败分别显示明确反馈，并避免重复提交。',
          term: 'State',
        },
      ],
      order: 10,
      title: '交互状态',
    },
  ],
}

describe('prompt glossary parser', () => {
  it('normalizes strings and orders sections without changing item order', () => {
    const parsed = parsePromptGlossaryContent(JSON.stringify({
      ...validDocument,
      intro: '  把模糊需求翻译成准确的开发表达。  ',
      sections: validDocument.sections.map(section => ({
        ...section,
        items: section.items.map(item => ({ ...item, aliases: [...item.aliases, item.aliases[0]] })),
      })),
    }))

    expect(parsed?.intro).toBe('把模糊需求翻译成准确的开发表达。')
    expect(parsed?.sections.map(section => section.id)).toEqual(['interaction-state', 'web-basics'])
    expect(parsed?.sections[1]?.items.map(item => item.id)).toEqual(['frontend', 'component'])
    expect(parsed?.sections[1]?.items[0]?.aliases).toEqual(['用户界面', '前台'])
    expect(parsed && promptGlossaryItemCount(parsed)).toBe(3)
  })

  it.each([
    ['unknown schema', { ...validDocument, schemaVersion: 2 }],
    ['missing field', { ...validDocument, intro: '' }],
    ['duplicate section id', { ...validDocument, sections: [validDocument.sections[0], validDocument.sections[0]] }],
    ['duplicate item id', {
      ...validDocument,
      sections: [
        validDocument.sections[0],
        { ...validDocument.sections[1], items: [{ ...validDocument.sections[1].items[0], id: 'frontend' }] },
      ],
    }],
  ])('rejects %s', (_label, input) => {
    expect(parsePromptGlossaryContent(JSON.stringify(input))).toBeNull()
  })
})

describe('prompt glossary search and export', () => {
  const parsed = parsePromptGlossaryContent(JSON.stringify(validDocument))!

  it('matches Chinese, English, aliases and multiple tokens', () => {
    expect(filterPromptGlossary(parsed, 'Frontend').total).toBe(1)
    expect(filterPromptGlossary(parsed, '前台').sections[0]?.items[0]?.id).toBe('frontend')
    expect(filterPromptGlossary(parsed, '组件 统一').sections[0]?.items[0]?.id).toBe('component')
    expect(filterPromptGlossary(parsed, '保存中', 'interaction-state').total).toBe(1)
    expect(filterPromptGlossary(parsed, '不存在').total).toBe(0)
  })

  it('formats a clean Markdown collection for copying', () => {
    const markdown = formatPromptGlossaryMarkdown(parsed, '开发术语')
    expect(markdown).toContain('# 开发术语')
    expect(markdown).toContain('## 01 · 交互状态')
    expect(markdown).toContain('### 前端（Frontend）')
    expect(markdown).toContain('> 请只调整前端展示与交互')
    expect(markdown).not.toContain('http')
  })
})
