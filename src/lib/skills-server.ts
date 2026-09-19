import 'server-only'

import { skillRepository } from '@/lib/repositories/skills'
import { createSkillSlug } from '@/lib/skills'

export async function ensureUniqueSkillSlug(
  requestedSlug: string,
  options: { excludeSkillId?: string, excludeSubmissionId?: string } = {},
) {
  const baseSlug = createSkillSlug(requestedSlug)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 76)}-${attempt + 1}`
    if (!await skillRepository.slugExists(candidate, options))
      return candidate
  }
  return `skill-${crypto.randomUUID()}`
}
