import type {
  NavigationAiCandidate,
  NavigationAiIntent,
  ScoredNavigationCandidate,
} from './types'

const QUERY_STOP_WORDS = new Set([
  '一个',
  '一些',
  '可以',
  '帮我',
  '我要',
  '我想',
  '推荐',
  '寻找',
  '搜索',
  '网站',
  '网页',
  '工具',
  '平台',
  '适合',
  'find',
  'need',
  'site',
  'tool',
  'want',
  'website',
])

export function scoreNavigationCandidates(
  sites: NavigationAiCandidate[],
  intent: NavigationAiIntent,
  latestQuery: string,
): ScoredNavigationCandidate[] {
  const terms = uniqueTerms([
    ...intent.keywords,
    ...intent.constraints,
    ...extractFallbackTerms(latestQuery),
  ])
  const categoryHints = uniqueTerms(intent.categories)

  return sites
    .map((site) => {
      const name = normalize(site.name)
      const description = normalize(site.description)
      const searchText = normalize('searchText' in site && typeof site.searchText === 'string' ? site.searchText : '')
      const hostname = normalize(readHostname(site.url))
      const tags = site.tags.map(normalize)
      const categories = site.categories.map(normalize)
      let matchScore = 0

      for (const hint of categoryHints) {
        const normalizedHint = normalize(hint)
        if (categories.includes(normalizedHint))
          matchScore += 20
        else if (categories.some(category => category.includes(normalizedHint) || normalizedHint.includes(category)))
          matchScore += 13
      }

      for (const term of terms) {
        const normalizedTerm = normalize(term)
        if (!normalizedTerm)
          continue
        if (name === normalizedTerm)
          matchScore += 28
        else if (name.includes(normalizedTerm) || normalizedTerm.includes(name))
          matchScore += 16
        if (categories.includes(normalizedTerm))
          matchScore += 16
        else if (categories.some(category => category.includes(normalizedTerm) || normalizedTerm.includes(category)))
          matchScore += 11
        if (tags.includes(normalizedTerm))
          matchScore += 12
        else if (tags.some(tag => tag.includes(normalizedTerm) || normalizedTerm.includes(tag)))
          matchScore += 8
        if (description.includes(normalizedTerm))
          matchScore += 4
        if (searchText.includes(normalizedTerm))
          matchScore += 3
        if (hostname.includes(normalizedTerm))
          matchScore += 3
      }

      const popularityScore = Math.min(6, Math.log10(Math.max(0, site.visitCount) + 1) * 2)
        + (site.commonlyUsed ? 3 : 0)
        + (site.recommend ? 2 : 0)
        + (site.pinned ? 1 : 0)

      return { matchScore, popularityScore, site }
    })
    .sort((left, right) => {
      const leftScore = left.matchScore * 10 + left.popularityScore
      const rightScore = right.matchScore * 10 + right.popularityScore
      return rightScore - leftScore || left.site.name.localeCompare(right.site.name, 'zh-CN')
    })
}

export function selectNavigationCandidates(scored: ScoredNavigationCandidate[], limit = 36) {
  const matched = scored.filter(candidate => candidate.matchScore > 0)
  if (matched.length)
    return matched.slice(0, limit)
  return scored.slice(0, Math.min(12, limit))
}

function extractFallbackTerms(query: string) {
  const pieces = query
    .toLowerCase()
    .split(/[\s,，。.!！?？、;；:：/|()（）【】[\]"'“”‘’]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !QUERY_STOP_WORDS.has(term))

  const concepts = [
    '视频',
    '图片',
    '绘画',
    '设计',
    '编程',
    '代码',
    '部署',
    '模型',
    '写作',
    '搜索',
    '音频',
    '音乐',
    '办公',
    '学习',
    '翻译',
    '开源',
    '免费',
    '智能体',
    'agent',
    '论文',
    '数据',
    '数字人',
    '语音',
  ].filter(concept => query.toLowerCase().includes(concept))

  return [...pieces, ...concepts]
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function readHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  }
  catch {
    return ''
  }
}

function uniqueTerms(values: string[]) {
  return [...new Set(values
    .map(value => value.trim())
    .filter(value => value.length >= 2 && value.length <= 32 && !QUERY_STOP_WORDS.has(value.toLowerCase())))]
    .slice(0, 16)
}
