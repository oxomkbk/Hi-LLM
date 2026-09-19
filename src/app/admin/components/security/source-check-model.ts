import type {
  SecuritySourceCheckResult,
  SecuritySourceCheckSubjectType,
} from '@/lib/ai-security/source-check-contract'

export type SourceCheckClientAction
  = | { key: string, type: 'fail' }
    | { key: string, type: 'start' }
    | { key: string, result: SecuritySourceCheckResult, type: 'succeed' }

export interface SourceCheckClientState {
  pending: ReadonlySet<string>
  results: Readonly<Record<string, SecuritySourceCheckResult>>
}

export function createSourceCheckState(): SourceCheckClientState {
  return { pending: new Set(), results: {} }
}

export function isCheckableGitSource(sourceUrl: string) {
  return sourceLinkLabel(sourceUrl).provider !== null
}

export function reduceSourceCheckState(
  state: SourceCheckClientState,
  action: SourceCheckClientAction,
): SourceCheckClientState {
  const pending = new Set(state.pending)
  if (action.type === 'start') {
    pending.add(action.key)
    return { ...state, pending }
  }
  pending.delete(action.key)
  if (action.type === 'fail')
    return { ...state, pending }
  return {
    pending,
    results: { ...state.results, [action.key]: action.result },
  }
}

export function sourceCheckKey(subjectType: SecuritySourceCheckSubjectType, subjectId: string) {
  return `${subjectType}:${subjectId}`
}

export function sourceLinkLabel(sourceUrl: string) {
  const fallback = { label: '查看来源', projectPath: null, provider: null } as const
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return fallback
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part))
    if (host === 'github.com' && parts.length >= 2) {
      const projectPath = `${parts[0]}/${stripGitSuffix(parts[1]!)}`
      return { label: `GitHub · ${projectPath}`, projectPath, provider: 'github' as const }
    }
    if (host === 'gitlab.com' && parts.length >= 2) {
      const marker = parts.findIndex((part, index) => part === '-' && parts[index + 1] === 'tree')
      const projectParts = (marker === -1 ? parts : parts.slice(0, marker))
      projectParts[projectParts.length - 1] = stripGitSuffix(projectParts.at(-1)!)
      const projectPath = projectParts.join('/')
      return { label: `GitLab · ${projectPath}`, projectPath, provider: 'gitlab' as const }
    }
    return fallback
  }
  catch {
    return fallback
  }
}

function stripGitSuffix(value: string) {
  return value.endsWith('.git') ? value.slice(0, -4) : value
}
