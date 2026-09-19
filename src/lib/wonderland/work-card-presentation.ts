const EDITORIAL_TAGS = new Set(['开源免费', '开源精选'])

export function hasVisibleEngagement(likes: number, views: number) {
  return likes > 0 || views > 0
}

export function visibleWorkTags(tags: string[]) {
  const visible: string[] = []
  for (const rawTag of tags) {
    const tag = rawTag.trim()
    if (!tag || EDITORIAL_TAGS.has(tag) || tag.startsWith('__seed:') || visible.includes(tag))
      continue
    visible.push(tag)
    if (visible.length === 3)
      break
  }
  return visible
}
