import { mcpRepository } from '@/lib/repositories/mcps'
import { promptRepository } from '@/lib/repositories/prompts'
import { skillRepository } from '@/lib/repositories/skills'
import { listWonderlandSitemapRows } from '@/lib/wonderland/repositories/community'
import { listWorkSitemapRows } from '@/lib/wonderland/repositories/works'

import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${appUrl}/ranking`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${appUrl}/skills`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${appUrl}/services`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${appUrl}/mcp`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.92,
    },
    {
      url: `${appUrl}/prompts`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.94,
    },
    {
      url: `${appUrl}/wonderland`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.92,
    },
    {
      url: `${appUrl}/wonderland/works`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.82,
    },
    {
      url: `${appUrl}/skills/submit`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${appUrl}/mcp/submit`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  let skills: Awaited<ReturnType<typeof skillRepository.sitemapRows>> = []
  let mcps: Awaited<ReturnType<typeof mcpRepository.sitemapRows>> = []
  let prompts: Awaited<ReturnType<typeof promptRepository.sitemapRows>> = []
  let wonderland: Awaited<ReturnType<typeof listWonderlandSitemapRows>> = { news: [], questions: [] }
  let works: Awaited<ReturnType<typeof listWorkSitemapRows>> = []
  try {
    [skills, mcps, prompts, wonderland, works] = await Promise.all([
      skillRepository.sitemapRows(),
      mcpRepository.sitemapRows(),
      promptRepository.sitemapRows(),
      listWonderlandSitemapRows(),
      listWorkSitemapRows(),
    ])
  }
  catch {
    return staticRoutes
  }

  return [
    ...staticRoutes,
    ...skills.map(skill => ({
      url: `${appUrl}/skills/${skill.slug}`,
      lastModified: new Date(skill.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...mcps.map(mcp => ({
      url: `${appUrl}/mcp/${mcp.slug}`,
      lastModified: new Date(mcp.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
    ...prompts.map(prompt => ({
      url: `${appUrl}/prompts/${prompt.slug}`,
      lastModified: new Date(prompt.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.78,
    })),
    ...wonderland.questions.map(question => ({
      url: `${appUrl}/wonderland/questions/${question.slug}`,
      lastModified: new Date(question.updated_at),
      changeFrequency: 'daily' as const,
      priority: 0.68,
    })),
    ...wonderland.news.map(article => ({
      url: `${appUrl}/wonderland/news/${article.slug}`,
      lastModified: new Date(article.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    })),
    ...works.map(work => ({
      url: `${appUrl}/wonderland/works/${work.slug}`,
      lastModified: new Date(work.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.66,
    })),
  ]
}
