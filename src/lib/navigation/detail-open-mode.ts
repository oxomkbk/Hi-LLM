import type { ContentDetailOpenMode } from '@/lib/access-settings/types'

export function resolveDetailLink(mode: ContentDetailOpenMode, href: string, contextualHref?: string) {
  if (mode === 'new_tab') {
    return {
      href,
      rel: 'noopener noreferrer' as const,
      target: '_blank' as const,
    }
  }
  return {
    href: contextualHref ?? href,
    rel: undefined,
    target: undefined,
  }
}
