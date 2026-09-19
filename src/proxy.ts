import { NextResponse } from 'next/server'

import { getServerSession } from '@/lib/auth/session'
import { assertNavigationAiRequestOrigin, assertSameOrigin } from '@/lib/security'
import { responseMessage } from '@/lib/utils'

import type { NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const path = request.nextUrl.pathname
  const isApiRoute = path.startsWith('/api')
  const isWriteApiRoute = isApiRoute && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  const isUserAccountApi = path === '/api/account' || path.startsWith('/api/account/')
  const isUserUploadApi = path === '/api/uploads' || path.startsWith('/api/uploads/')
  const isUserCommunityApi = path === '/api/wonderland' || path.startsWith('/api/wonderland/')
  const isPublicPage = path === '/'
    || path === '/ranking'
    || path === '/services'
    || path === '/skills'
    || path.startsWith('/skills/')
    || path === '/mcp'
    || path.startsWith('/mcp/')
    || path === '/prompts'
    || path.startsWith('/prompts/')
    || path === '/wonderland'
    || path.startsWith('/wonderland/')
    || path.startsWith('/users/')
  const isPublicSubmission = path === '/api/submissions' && request.method === 'POST'
  const isPublicSkillSubmission = path === '/api/skill-submissions' && request.method === 'POST'
  const isPublicMcpSubmission = path === '/api/mcp-submissions' && request.method === 'POST'
  const isPublicNavigationAi = path === '/api/public/navigation-ai' && request.method === 'POST'
  const isPublicVisit = /^\/api\/websites\/[^/]+\/visit$/.test(path) && request.method === 'POST'
  const isPublicWonderlandView = request.method === 'POST'
    && (/^\/api\/wonderland\/questions\/[^/]+\/view$/.test(path)
      || /^\/api\/wonderland\/works\/[^/]+\/view$/.test(path))
  const isPublicReadApi = request.method === 'GET'
    && (path.startsWith('/api/public/') || path === '/api/rankings')
  const isAuthApi = path.startsWith('/api/auth/')

  if (isWriteApiRoute && !isAuthApi) {
    try {
      if (isPublicNavigationAi)
        assertNavigationAiRequestOrigin(request)
      else
        assertSameOrigin(request)
    }
    catch {
      return NextResponse.json(responseMessage(null, '请求来源校验失败', -1), { status: 403 })
    }
  }

  if (isPublicPage || isPublicReadApi || isPublicSubmission || isPublicSkillSubmission || isPublicMcpSubmission || isPublicNavigationAi || isPublicVisit || isPublicWonderlandView || isAuthApi)
    return response

  try {
    const session = await getServerSession(request.headers)
    const isAdmin = session?.user.status === 'active' && session.user.role === 'admin'

    if (session && isAdmin && path.startsWith('/login'))
      return NextResponse.redirect(new URL('/admin', request.url))

    if (!session && isWriteApiRoute) {
      return NextResponse.json(
        responseMessage(null, '未登录', -1, { code: 'AUTH_REQUIRED', retryable: false }),
        { status: 401 },
      )
    }

    if (session && !isAdmin && (path.startsWith('/admin') || (isWriteApiRoute && !isUserAccountApi && !isUserUploadApi && !isUserCommunityApi))) {
      if (isApiRoute)
        return NextResponse.json(responseMessage(null, '无管理员权限', -1, { code: 'AUTH_FORBIDDEN', retryable: false }), { status: 403 })

      return NextResponse.redirect(new URL('/', request.url))
    }

    if (!session && !isApiRoute && !path.startsWith('/login'))
      return NextResponse.redirect(new URL('/login', request.url))

    return response
  }
  catch {
    return NextResponse.json(
      responseMessage(null, '认证服务暂不可用', -1, { code: 'AUTH_SERVICE_UNAVAILABLE', retryable: true }),
      { status: 503, headers: { 'Retry-After': '5' } },
    )
  }
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js|json|xml|txt|md|png|jpg|jpeg|gif|webp|avif|ico|bmp|svg|tiff|tif|mp4|webm|ogg|mp3|wav|flac|aac|woff|woff2|eot|ttf|otf|webmanifest)$).*)',
  ],
}
