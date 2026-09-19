import { cache } from 'react'

import { skillRepository } from '@/lib/repositories/skills'

import type { Skill } from '@/types'

export const getPublishedSkill = cache(async (slug: string): Promise<Skill | null> => {
  return skillRepository.findPublishedBySlug(slug)
})

export async function getRelatedSkills(skill: Skill): Promise<Skill[]> {
  return skillRepository.listRelated(skill, 3)
}
