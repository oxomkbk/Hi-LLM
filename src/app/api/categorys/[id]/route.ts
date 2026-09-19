import { NextResponse } from 'next/server'

import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import { catalogRepository } from '@/lib/repositories/catalog'
import { isUuid } from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { CategorySaveParams } from '@/types'
import type { NextRequest } from 'next/server'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('分类参数无效')
    const data = await catalogRepository.deleteCategory(id)
    if (!data)
      return NextResponse.json(responseMessage(null, '分类不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    if (databaseErrorCode(error) === '23503')
      return NextResponse.json(responseMessage(null, '分类下仍有网站，无法删除', RESPONSE.ERROR), { status: 409 })
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request.headers)
    const { id } = await params
    if (!isUuid(id))
      throw new Error('分类参数无效')
    const data = await catalogRepository.updateCategory(id, readCategoryInput(await request.json()))
    if (!data)
      return NextResponse.json(responseMessage(null, '分类不存在', RESPONSE.ERROR), { status: 404 })
    return NextResponse.json(responseMessage(data))
  }
  catch (error) {
    if (databaseErrorCode(error) === '23505')
      return NextResponse.json(responseMessage(null, '分类名称已存在！', RESPONSE.ERROR), { status: 409 })
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 400
  return NextResponse.json(responseMessage(null, (error as Error).message, RESPONSE.ERROR), { status })
}

function readCategoryInput(value: unknown): CategorySaveParams {
  if (!value || typeof value !== 'object')
    throw new Error('参数错误')
  const body = value as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sort = Number(body.sort)
  if (!name || name.length > 100 || !Number.isInteger(sort) || sort < 1 || sort > 99)
    throw new Error('参数错误')
  return { name, sort }
}
