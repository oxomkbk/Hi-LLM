import { createAssessmentJob } from '@/lib/ai-security/queue'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { readPromptJsonBody, sanitizePromptAdminInput } from '@/lib/prompts'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'
import { isUuid } from '@/lib/security'

import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('Prompt 编号无效')
    const current = await promptRepository.findById(id)
    if (!current)
      return promptSuccess(null, 'Prompt 不存在', 404)
    const deleted = await promptRepository.delete(id)
    if (!deleted)
      return promptSuccess(null, '只有草稿或已归档内容可以删除', 409)
    return promptSuccess(deleted, 'Prompt 已删除，关联素材仍保留在素材库中')
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('Prompt 编号无效')
    const prompt = await promptRepository.findById(id)
    if (!prompt)
      return promptSuccess(null, 'Prompt 不存在', 404)
    return promptSuccess(prompt, 'Prompt 已加载', 200, { 'Cache-Control': 'no-store' })
  }
  catch (error) {
    return promptErrorResponse(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body, session] = await Promise.all([params, readPromptJsonBody(request), requireAdminSession(request.headers)])
    if (!isUuid(id))
      throw new Error('Prompt 编号无效')
    const current = await promptRepository.findById(id)
    if (!current)
      return promptSuccess(null, 'Prompt 不存在', 404)
    const input = sanitizePromptAdminInput(body)
    const updated = await promptRepository.update(id, input, session.user, current)
    if (updated.publish_requested_at) {
      const queued = await createAssessmentJob({
        actor: session.user,
        subjectId: updated.id,
        subjectType: 'prompt',
        trigger: 'publish_gate',
      }).then(() => true).catch(() => false)
      return promptSuccess(updated, queued ? '更新已保存，安全检查通过后会自动发布' : '更新已保存，安全检查暂未启动', 202)
    }
    return promptSuccess(updated, input.status === 'published' ? 'Prompt 已发布' : 'Prompt 草稿已保存')
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      return promptErrorResponse(Object.assign(new Error('访问地址或文档路径已存在'), { status: 409, code: 'PROMPT_CONFLICT' }))
    return promptErrorResponse(error)
  }
}
