import { requireAdminSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { createPromptImport } from '@/lib/prompts/import-service'
import { isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([requireAdminSession(request.headers), request.json() as Promise<{ fileId?: string }>])
    if (!isUuid(body.fileId))
      throw new Error('ZIP 文件编号无效')
    return promptSuccess(await createPromptImport(body.fileId, session.user), '压缩包解析完成', 201)
  }
  catch (error) { return promptErrorResponse(error) }
}
