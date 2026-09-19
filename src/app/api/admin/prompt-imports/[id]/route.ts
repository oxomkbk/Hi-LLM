import { requireAdminSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { getPromptImport } from '@/lib/prompts/import-service'
import { isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([requireAdminSession(request.headers), params])
    if (!isUuid(id))
      throw new Error('导入任务编号无效')
    const result = await getPromptImport(id, session.user.id)
    return result ? promptSuccess(result, '导入任务已加载', 200, { 'Cache-Control': 'no-store' }) : promptSuccess(null, '导入任务不存在', 404)
  }
  catch (error) { return promptErrorResponse(error) }
}
