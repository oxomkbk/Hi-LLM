import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { createSystemAssessmentJob } from '@/lib/ai-security/queue'
import { requireUserSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('prompt', request.headers)
    const [session, { id }] = await Promise.all([requireUserSession(request.headers), params])
    if (!isUuid(id))
      throw new Error('Prompt 编号无效')
    const completed = await promptRepository.finalizeCommunitySubmission(id, session.user.id)
    if (!completed)
      return promptSuccess(null, '投稿不存在', 404)
    const assessment = await createSystemAssessmentJob({ subjectId: id, subjectType: 'prompt' }).catch(() => null)
    return promptSuccess(
      { id, security_scan_queued: Boolean(assessment) },
      assessment ? '投稿完成，安全检查已自动开始' : '投稿完成，管理员可在后台继续处理',
    )
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}
