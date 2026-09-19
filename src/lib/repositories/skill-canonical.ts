import type { SkillContent } from '@/types'
import type { PoolClient } from 'pg'

export async function hasSkillCanonicalConflict(
  client: PoolClient,
  skill: Pick<SkillContent, 'author_name' | 'install_command' | 'name' | 'slug' | 'source_kind' | 'source_url'>,
  exclude: { skillId?: string, submissionId?: string } = {},
) {
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [skillCanonicalKey(skill)])
  const result = await client.query<{ duplicate: boolean }>(`
    select exists(
      select 1 from public.ds_skills
      where ($1::uuid is null or id <> $1::uuid)
        and (
          ($3::text is not null and lower(source_url) = lower($3) and (
            ($4::text = 'git_repository' and source_kind = 'git_repository'
              and lower(coalesce(install_command, '')) = lower(coalesce($5, '')))
            or ($4::text <> 'git_repository' and source_kind <> 'git_repository')
          ))
          or ($3::text is null and (
            slug = $6
            or (lower(btrim(name)) = lower(btrim($7)) and lower(btrim(author_name)) = lower(btrim($8)))
          ))
        )
    ) or exists(
      select 1 from public.ds_skill_submissions
      where ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'pending_security')
        and (
          ($3::text is not null and lower(source_url) = lower($3) and (
            ($4::text = 'git_repository' and source_kind = 'git_repository'
              and lower(coalesce(install_command, '')) = lower(coalesce($5, '')))
            or ($4::text <> 'git_repository' and source_kind <> 'git_repository')
          ))
          or ($3::text is null and (
            slug = $6
            or (lower(btrim(name)) = lower(btrim($7)) and lower(btrim(author_name)) = lower(btrim($8)))
          ))
        )
    ) as duplicate
  `, [
    exclude.skillId ?? null,
    exclude.submissionId ?? null,
    skill.source_url,
    skill.source_kind,
    skill.install_command,
    skill.slug,
    skill.name,
    skill.author_name,
  ])
  return result.rows[0]?.duplicate ?? false
}

export function skillCanonicalKey(
  skill: Pick<SkillContent, 'author_name' | 'install_command' | 'name' | 'source_kind' | 'source_url'>,
) {
  if (skill.source_url) {
    const source = skill.source_url.trim().toLowerCase()
    return skill.source_kind === 'git_repository'
      ? `git:${source}:${skill.install_command?.trim().toLowerCase() ?? ''}`
      : `source:${source}`
  }
  return `platform:${normalize(skill.name)}:${normalize(skill.author_name)}`
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}
