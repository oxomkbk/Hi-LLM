import path from 'node:path'

import { requireAdminSession } from '@/lib/auth/session'
import { getControlPool } from '@/lib/db/control'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { fileRepository } from '@/lib/repositories/files'
import { promptRepository } from '@/lib/repositories/prompts'
import { isUuid } from '@/lib/security'

import type { PromptAssetRole } from '@/types'
import type { NextRequest } from 'next/server'

const ROLES = new Set<PromptAssetRole>(['attachment', 'cover', 'image', 'poster', 'video', 'web_preview'])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }, body] = await Promise.all([
      requireAdminSession(request.headers),
      params,
      request.json() as Promise<Record<string, unknown>>,
    ])
    if (!isUuid(id) || !isUuid(body.fileId))
      throw new Error('Prompt 或文件编号无效')
    const [prompt, file, upload] = await Promise.all([
      promptRepository.findById(id),
      fileRepository.findById(body.fileId),
      getControlPool().query<{ scope: string, status: string, user_id: string }>(`
        select scope, status, user_id from control.upload_sessions where file_object_id = $1::uuid limit 1
      `, [body.fileId]),
    ])
    if (!prompt)
      return promptSuccess(null, 'Prompt 不存在', 404)
    if (!file || file.status !== 'ready' || upload.rows[0]?.scope !== 'prompt-asset' || upload.rows[0]?.status !== 'completed' || upload.rows[0]?.user_id !== session.user.id)
      throw new Error('请选择刚刚上传完成的 Prompt 资源')
    const role = ROLES.has(body.role as PromptAssetRole) ? body.role as PromptAssetRole : inferRole(file.mime_type, file.extension)
    const asset = await promptRepository.attachAsset(id, {
      altText: typeof body.altText === 'string' ? body.altText.trim().slice(0, 240) : null,
      fileId: file.id,
      isDownloadable: body.isDownloadable === true || role === 'attachment',
      isEntrypoint: body.isEntrypoint === true && role === 'web_preview',
      isPrimary: body.isPrimary === true,
      name: file.original_name,
      origin: 'direct_upload',
      role,
      sourcePath: `uploads/${file.id}/${path.basename(file.original_name)}`,
    })
    return promptSuccess(asset, '资源已添加', 201)
  }
  catch (error) { return promptErrorResponse(error) }
}

function inferRole(mime: string, extension: string): PromptAssetRole {
  if (mime.startsWith('image/'))
    return 'image'
  if (mime.startsWith('video/'))
    return 'video'
  if (mime === 'text/html' || ['htm', 'html'].includes(extension))
    return 'web_preview'
  return 'attachment'
}
