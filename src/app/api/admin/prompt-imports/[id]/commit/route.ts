import { requireAdminSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { commitPromptImport } from '@/lib/prompts/import-service'
import { isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }, body] = await Promise.all([
      requireAdminSession(request.headers),
      params,
      request.json().catch(() => ({})) as Promise<Record<string, unknown>>,
    ])
    if (!isUuid(id))
      throw new Error('导入任务编号无效')
    return promptSuccess(await commitPromptImport(id, session.user, body), '已从压缩包创建草稿', 201)
  }
  catch (error) { return promptErrorResponse(error) }
}
