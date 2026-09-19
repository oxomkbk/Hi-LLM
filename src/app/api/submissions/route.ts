import { Buffer } from 'node:buffer'

import { NextResponse } from 'next/server'

import { AccessSettingsError, requireSubmissionAccess } from '@/lib/access-settings/service'
import { requireAdminSession } from '@/lib/auth/session'
import { databaseErrorCode } from '@/lib/db/business'
import {
  completeSmallFileUpload,
  deleteFileObject,
  failSmallFileUpload,
  fileToken,
  storeSmallFile,
} from '@/lib/files/service'
import {
  SubmissionConflictError,
  SubmissionRateLimitError,
  websiteSubmissionRepository,
} from '@/lib/repositories/website-submissions'
import {
  assertSameOrigin,
  createTrustedVisitorHash,
  sanitizeWebsiteInput,
  validateLogoFile,
} from '@/lib/security'
import { RESPONSE, responseMessage } from '@/lib/utils'

import type { WebsiteSubmissionStatus } from '@/types'
import type { NextRequest } from 'next/server'

const ALLOWED_STATUS = new Set<WebsiteSubmissionStatus>(['pending', 'approved', 'rejected'])

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request.headers)
    const searchParams = request.nextUrl.searchParams
    const requestedPageIndex = Number(searchParams.get('pageIndex') || 0)
    const requestedPageSize = Number(searchParams.get('pageSize') || 20)
    const pageIndex = Number.isInteger(requestedPageIndex) && requestedPageIndex >= 0 ? requestedPageIndex : 0
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(100, Math.max(1, requestedPageSize)) : 20
    const requestedStatus = searchParams.get('status') as WebsiteSubmissionStatus | null
    const status = requestedStatus && ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : undefined
    const name = searchParams.get('name')?.trim().slice(0, 100)
    const data = await websiteSubmissionRepository.list({
      limit: pageSize,
      name,
      offset: pageIndex * pageSize,
      status,
    })
    return NextResponse.json(responseMessage({
      list: data.list,
      page: pageIndex + 1,
      pageSize,
      total: data.total,
    }))
  }
  catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  let uploadedFileId: string | null = null
  let uploadSessionId: string | null = null
  try {
    assertSameOrigin(request)
    await requireSubmissionAccess('website', request.headers)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 2 * 1024 * 1024)
      return NextResponse.json(responseMessage(null, '提交内容过大', RESPONSE.ERROR), { status: 413 })

    const formData = await request.formData()
    if (formData.get('company'))
      return NextResponse.json(responseMessage(null, '提交成功'))

    const website = sanitizeWebsiteInput({
      category_ids: formData.getAll('category_ids'),
      desc: formData.get('desc'),
      name: formData.get('name'),
      tags: [],
      url: formData.get('url'),
      vpn: formData.get('vpn') === 'true',
    })
    const submittedIpHash = createTrustedVisitorHash(request, 'website-submission')
    await websiteSubmissionRepository.preflight({
      categoryIds: website.category_ids,
      submittedIpHash,
      url: website.url,
    })

    const { extension, file } = await validateLogoFile(formData.get('logo'))
    const stored = await storeSmallFile({
      body: Buffer.from(await file.arrayBuffer()),
      extension,
      mimeType: file.type,
      originalName: file.name,
      scope: 'website-logo',
      visibility: 'private',
    })
    uploadedFileId = stored.id
    uploadSessionId = stored.infrastructureUploadSessionId
    const data = await websiteSubmissionRepository.create({
      ...website,
      id: crypto.randomUUID(),
      logo: fileToken(stored.id),
      submittedIpHash,
    })
    await completeSmallFileUpload(uploadSessionId).catch(() => undefined)
    uploadedFileId = null
    uploadSessionId = null
    return NextResponse.json(responseMessage(data, '提交成功，审核通过后会出现在首页'), { status: 201 })
  }
  catch (error) {
    if (uploadedFileId)
      await deleteFileObject(uploadedFileId).catch(() => undefined)
    if (uploadSessionId)
      await failSmallFileUpload(uploadSessionId).catch(() => undefined)
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  const message = (error as Error).message
  const status = error instanceof AccessSettingsError
    ? error.status
    : error instanceof SubmissionRateLimitError
      ? 429
      : error instanceof SubmissionConflictError || databaseErrorCode(error) === '23505'
        ? 409
        : typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : message === '请求来源校验失败'
            ? 403
            : 400
  const code = error instanceof AccessSettingsError ? error.code : 'WEBSITE_SUBMISSION_FAILED'
  return NextResponse.json(
    responseMessage(null, message, RESPONSE.ERROR, { code, retryable: status >= 500 }),
    { status },
  )
}
