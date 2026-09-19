import { requireAdminSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'
import { isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ assetId: string, id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { assetId, id } = await params
    if (!isUuid(id) || !isUuid(assetId))
      throw new Error('资源编号无效')
    const asset = await promptRepository.findAsset(id, assetId)
    if (!asset)
      return promptSuccess(null, '资源不存在', 404)
    if (asset.origin === 'package_source')
      return promptSuccess(null, '导入源包需要随 Prompt 一起保留', 409)
    const removed = await promptRepository.removeAsset(id, assetId)
    return promptSuccess(removed, '资源关联已移除，素材仍保留在素材库中')
  }
  catch (error) { return promptErrorResponse(error) }
}
