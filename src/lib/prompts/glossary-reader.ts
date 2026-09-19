import type { FilteredPromptGlossary, PromptGlossaryItem, PromptGlossarySection } from './glossary'

export interface IndexedPromptGlossaryItem {
  item: PromptGlossaryItem
  section: PromptGlossarySection
}

export type PromptGlossaryNavigationKey = 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'End' | 'Home'

export function flattenPromptGlossary(result: FilteredPromptGlossary): IndexedPromptGlossaryItem[] {
  return result.sections.flatMap(section => section.items.map(item => ({ item, section })))
}

export function movePromptGlossaryIndex(currentIndex: number, length: number, key: PromptGlossaryNavigationKey) {
  if (length <= 0)
    return -1
  const last = length - 1
  if (key === 'Home')
    return 0
  if (key === 'End')
    return last
  if (key === 'ArrowRight' || key === 'ArrowDown')
    return Math.min(Math.max(currentIndex, 0) + 1, last)
  return Math.max(Math.min(currentIndex, last) - 1, 0)
}

export function resolveActivePromptGlossaryIndex(items: IndexedPromptGlossaryItem[], selectedItemId: string) {
  if (!items.length)
    return -1
  const selected = items.findIndex(entry => entry.item.id === selectedItemId)
  return selected >= 0 ? selected : 0
}
