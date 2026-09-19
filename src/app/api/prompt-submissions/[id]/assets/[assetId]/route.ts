import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ assetId: string, id: string }> }) {
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('prompt', request.headers)
    const [session, { assetId, id }] = await Promise.all([
      requireUserSession(request.headers),
      params,
    ])
    if (!isUuid(id) || !isUuid(assetId))
      throw new Error('资源编号无效')
    const removed = await promptRepository.removeCommunityAsset(id, assetId, session.user.id)
    return promptSuccess(removed, removed ? '资源关联已移除，素材仍保留在素材库中' : '资源已经移除')
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}
