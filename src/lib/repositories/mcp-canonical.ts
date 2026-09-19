import type { McpContent } from '@/types'
import type { PoolClient } from 'pg'

type McpCanonicalFields = Pick<McpContent, 'registry_name' | 'slug' | 'source_url'>

export async function hasMcpCanonicalConflict(
  client: PoolClient,
  mcp: McpCanonicalFields,
  exclude: { mcpId?: string, submissionId?: string } = {},
) {
  await lockMcpCanonicalIdentity(client, mcp)
  const result = await client.query<{ duplicate: boolean }>(`
    select exists(
      select 1 from public.ds_mcps
      where ($1::uuid is null or id <> $1::uuid)
        and (
          lower(source_url) = lower($3)
          or ($4::text is not null and lower(registry_name) = lower($4))
          or lower(slug) = lower($5)
        )
    ) or exists(
      select 1 from public.ds_mcp_submissions
      where ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'pending_security')
        and (
          lower(source_url) = lower($3)
          or ($4::text is not null and lower(registry_name) = lower($4))
          or lower(slug) = lower($5)
        )
    ) as duplicate
  `, [
    exclude.mcpId ?? null,
    exclude.submissionId ?? null,
    mcp.source_url,
    mcp.registry_name,
    mcp.slug,
  ])
  return result.rows[0]?.duplicate ?? false
}

export async function lockMcpCanonicalIdentity(client: PoolClient, mcp: McpCanonicalFields) {
  for (const key of mcpCanonicalKeys(mcp))
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [key])
}

export function mcpCanonicalKey(mcp: McpCanonicalFields) {
  return mcpCanonicalKeys(mcp)[0]
}

function mcpCanonicalKeys(mcp: McpCanonicalFields) {
  return [
    mcp.registry_name ? `mcp-registry:${normalize(mcp.registry_name)}` : null,
    mcp.source_url ? `mcp-source:${normalize(mcp.source_url)}` : null,
    `mcp-slug:${normalize(mcp.slug)}`,
  ].filter((value): value is string => Boolean(value)).sort()
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}
