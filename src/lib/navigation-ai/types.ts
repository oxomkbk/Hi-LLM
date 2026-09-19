export interface NavigationAiCandidate extends NavigationAiSite {
  commonlyUsed: boolean
  pinned: boolean
  recommend: boolean
  visitCount: number
}

export interface NavigationAiIntent {
  categories: string[]
  constraints: string[]
  keywords: string[]
}

export interface NavigationAiMessage {
  content: string
  role: NavigationAiRole
}

export interface NavigationAiResponse {
  answer: string
  results: NavigationAiSite[]
  suggestions: string[]
}

export type NavigationAiRole = 'assistant' | 'user'

export interface NavigationAiSite {
  categories: string[]
  description: string
  id: string
  logo: string | null
  name: string
  tags: string[]
  url: string
  vpn: boolean
}

export interface ScoredNavigationCandidate {
  matchScore: number
  popularityScore: number
  site: NavigationAiCandidate
}
