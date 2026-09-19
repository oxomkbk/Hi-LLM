import { readPublicCatalogSort } from '@/lib/catalog-sort'
import { SKILL_CATEGORIES, SKILL_PLATFORMS, SKILL_SCENARIOS } from '@/lib/skill-constants'

import SkillsExplorer from './skills-explorer'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `Skills 社区 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '发现、筛选并分享可复用的 AI Skills，让 Agent 更快掌握专业工作流。',
  keywords: ['AI Skills', 'Agent Skills', 'Codex', 'Claude Code', 'Cursor', '技能社区'],
  openGraph: {
    title: `Skills 社区 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
    description: '由社区共同维护的 AI Skills 目录。',
    type: 'website',
  },
}

interface SkillsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const query = await searchParams
  const category = readSingleValue(query.category)
  const platform = readSingleValue(query.platform)
  const scenario = readSingleValue(query.scenario)
  const page = Number(readSingleValue(query.page))

  return (
    <SkillsExplorer
      initialCategory={(SKILL_CATEGORIES as readonly string[]).includes(category) ? category : ''}
      initialFeatured={readSingleValue(query.featured) === 'true'}
      initialPage={Number.isInteger(page) && page > 0 && page <= 10_001 ? page : 1}
      initialPlatform={(SKILL_PLATFORMS as readonly string[]).includes(platform) ? platform : ''}
      initialQuery={readSingleValue(query.q).slice(0, 100)}
      initialScenario={(SKILL_SCENARIOS as readonly string[]).includes(scenario) ? scenario : ''}
      initialSort={readPublicCatalogSort(readSingleValue(query.sort))}
    />
  )
}

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}
