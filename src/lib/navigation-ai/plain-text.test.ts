import { describe, expect, it } from 'vitest'

import { normalizeNavigationAiPlainText } from './plain-text'

describe('navigation AI plain text normalization', () => {
  it('removes visible markdown decoration while keeping readable structure', () => {
    expect(normalizeNavigationAiPlainText([
      '## 推荐结果',
      '',
      '1. **Runway** — 适合专业视频制作。',
      '- `ZeroCut` — 自动化剪辑。',
    ].join('\n'))).toBe([
      '推荐结果',
      '',
      '1. Runway — 适合专业视频制作。',
      '• ZeroCut — 自动化剪辑。',
    ].join('\n'))
  })

  it('limits output after normalization', () => {
    expect(normalizeNavigationAiPlainText('**abcdef**', 4)).toBe('abcd')
  })
})
