import { requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireUserSession } from '@/lib/auth/session'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { fileRepository } from '@/lib/repositories/files'
import { promptRepository, PromptRepositoryError } from '@/lib/repositories/prompts'
import { assertSameOrigin, isUuid } from '@/lib/security'

import type { PromptAssetRole } from '@/types'
import type { NextRequest } from 'next/server'

const ROLES = new Set<PromptAssetRole>(['attachment', 'cover', 'image', 'poster', 'source_package', 'video', 'web_preview'])

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSubmissionAccess('prompt', request.headers)
    const [session, { id }] = await Promise.all([
      requireUserSession(request.headers),
      params,
    ])
    if (!isUuid(id))
      throw new PromptRepositoryError('Prompt 编号无效', 400, 'PROMPT_ID_INVALID')
    const assets = await promptRepository.listOwnedCommunityDraftAssets(id, session.user.id)
    return promptSuccess(assets, '投稿资源已读取')
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('prompt', request.headers)
    const [session, { id }, body] = await Promise.all([
      requireUserSession(request.headers),
      params,
      request.json() as Promise<Record<string, unknown>>,
    ])
    if (!isUuid(id) || !isUuid(body.fileId))
      throw new PromptRepositoryError('Prompt 或文件编号无效', 400, 'PROMPT_ASSET_REFERENCE_INVALID')
    if (!isUuid(body.assetKey))
      throw new PromptRepositoryError('资源上传标识无效', 400, 'PROMPT_ASSET_KEY_INVALID')

    const file = await fileRepository.findById(body.fileId)
    if (!file || file.status !== 'ready' || file.owner_id !== session.user.id)
      throw new Error('请选择素材库中属于你的可用素材')

    const role = ROLES.has(body.role as PromptAssetRole) ? body.role as PromptAssetRole : inferRole(file.mime_type, file.extension)
    const attached = await promptRepository.attachCommunityAsset(id, session.user.id, {
      altText: typeof body.altText === 'string' ? body.altText.trim().slice(0, 240) : null,
      assetKey: body.assetKey,
      fileId: file.id,
      isDownloadable: role === 'attachment' || role === 'source_package',
      isEntrypoint: role === 'web_preview',
      isPrimary: body.isPrimary === true && ['cover', 'image', 'video', 'web_preview'].includes(role),
      name: file.original_name,
      role,
    })
    return promptSuccess(
      attached.asset,
      attached.created ? '资源已添加' : '资源已存在',
      attached.created ? 201 : 200,
    )
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}

function inferRole(mime: string, extension: string): PromptAssetRole {
  if (mime.startsWith('image/'))
    return 'image'
  if (mime.startsWith('video/'))
    return 'video'
  if (mime === 'text/html' || ['htm', 'html'].includes(extension))
    return 'web_preview'
  if (['zip'].includes(extension))
    return 'source_package'
  return 'attachment'
}
