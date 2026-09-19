import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { createPromptSlug } from '@/lib/prompts'
import { promptErrorResponse, promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

import type { PromptContentKind } from '@/types'
import type { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const id = request.nextUrl.searchParams.get('id') ?? ''
    const deleted = await promptRepository.deleteCategory(id)
    return deleted ? promptSuccess(deleted, '分类已删除') : promptSuccess(null, '分类正在使用或包含子分类，不能删除', 409)
  }
  catch (error) { return promptErrorResponse(error) }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    return promptSuccess(await promptRepository.listCategories(), '分类已加载', 200, { 'Cache-Control': 'no-store' })
  }
  catch (error) { return promptErrorResponse(error) }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const body = await request.json() as Record<string, unknown>
    return promptSuccess(await promptRepository.createCategory(categoryInput(body)), '分类已创建', 201)
  }
  catch (error) { return categoryError(error) }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id ?? '')
    const updated = await promptRepository.updateCategory(id, categoryInput(body))
    return updated ? promptSuccess(updated, '分类已保存') : promptSuccess(null, '分类不存在', 404)
  }
  catch (error) { return categoryError(error) }
}

function categoryError(error: unknown) {
  return databaseErrorCode(error) === '23505'
    ? promptErrorResponse(Object.assign(new Error('分类地址已存在'), { status: 409, code: 'PROMPT_CATEGORY_CONFLICT' }))
    : promptErrorResponse(error)
}

function categoryInput(body: Record<string, unknown>) {
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
  const kind = parentId ? null : body.kind
  if (!parentId && !['adaptation', 'general', 'image', 'video', 'web_ui'].includes(String(kind)))
    throw new Error('根分类必须选择内容类型')
  const name = String(body.name ?? '').trim().slice(0, 60)
  if (!name)
    throw new Error('请填写分类名称')
  const sort = Number(body.sort ?? 1)
  if (!Number.isInteger(sort) || sort < 1 || sort > 99)
    throw new Error('排序必须是 1 到 99 的整数')
  const description = String(body.description ?? '').trim().slice(0, 240) || null
  return {
    active: body.active !== false,
    description,
    kind: kind as PromptContentKind | 'general' | null,
    name,
    parentId,
    slug: createPromptSlug(body.slug ?? name).replace(/^prompt-/, 'category-'),
    sort,
  }
}
