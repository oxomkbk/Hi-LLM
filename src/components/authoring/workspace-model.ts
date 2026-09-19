export interface AuthoringCompletion {
  completed: number
  percent: number
  total: number
}

export interface AuthoringCompletionItem {
  completed: boolean
}

export type AuthoringStage = 'publish' | 'write'

export interface AuthoringStageSection {
  key: string
  stage: AuthoringStage
}

export function getAuthoringCompletion(items: readonly AuthoringCompletionItem[]): AuthoringCompletion {
  const total = items.length
  const completed = items.reduce((count, item) => count + (item.completed ? 1 : 0), 0)
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, percent, total }
}

export function getAuthoringStageSections(sections: readonly AuthoringStageSection[], stage: AuthoringStage) {
  return sections.filter(section => section.stage === stage).map(section => section.key)
}
