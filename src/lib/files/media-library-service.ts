import 'server-only'

import { queryBusiness } from '@/lib/db/business'

import type { AdminUserRole } from '@/types'

export interface MediaLibraryItem {
  createdAt: string
  id: string
  mimeType: string
  name: string
  owner?: { email: string | null, id: string | null }
  sizeBytes: number
  url: string
}

export type MediaLibraryKind = 'all' | 'image' | 'video'

interface MediaLibraryRow {
  created_at: Date
  id: string
  mime_type: string
  original_name: string
  owner_email: string | null
  owner_id: string | null
  size_bytes: string
}

export async function listMediaLibrary(input: {
  actorId: string
  actorRole: AdminUserRole
  kind: MediaLibraryKind
  page: number
  pageSize: number
  q?: string
}) {
  const conditions = [`file.status = 'ready'`]
  const values: unknown[] = []

  if (input.actorRole !== 'admin') {
    values.push(input.actorId)
    conditions.push(`file.owner_id = $${values.length}::uuid`)
  }
  if (input.kind !== 'all') {
    values.push(`${input.kind}/%`)
    conditions.push(`file.mime_type like $${values.length}`)
  }
  if (input.q) {
    values.push(`%${escapeLike(input.q)}%`)
    conditions.push(`file.original_name ilike $${values.length} escape '\\'`)
  }

  const where = `where ${conditions.join(' and ')}`
  const listValues = [...values, input.pageSize, (input.page - 1) * input.pageSize]
  const [count, files] = await Promise.all([
    queryBusiness<{ total: string }>(`
      select count(*)::text as total
      from public.file_objects file
      ${where}
    `, values),
    queryBusiness<MediaLibraryRow>(`
      select file.id, file.original_name, file.mime_type, file.size_bytes::text,
             file.owner_id, owner.email as owner_email, file.created_at
      from public.file_objects file
      left join public.app_users owner on owner.id = file.owner_id
      ${where}
      order by file.created_at desc, file.id desc
      limit $${listValues.length - 1} offset $${listValues.length}
    `, listValues),
  ])

  return {
    list: files.rows.map(row => ({
      createdAt: row.created_at.toISOString(),
      id: row.id,
      mimeType: row.mime_type,
      name: row.original_name,
      ...(input.actorRole === 'admin'
        ? { owner: { email: row.owner_email, id: row.owner_id } }
        : {}),
      sizeBytes: Number(row.size_bytes),
      url: `/api/files/${row.id}`,
    }) satisfies MediaLibraryItem),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(count.rows[0]?.total ?? 0),
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}
