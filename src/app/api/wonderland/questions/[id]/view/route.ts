import { createFileReadIdentity, isUuid } from '@/lib/security'
import { WonderlandError } from '@/lib/wonderland/errors'
import { wonderlandErrorResponse, wonderlandSuccess } from '@/lib/wonderland/http'
import { recordQuestionView } from '@/lib/wonderland/services/community'

import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id))
      throw new WonderlandError('问题编号无效', 400, 'QUESTION_ID_INVALID')
    const data = await recordQuestionView({ identityHash: createFileReadIdentity(request), questionId: id })
    return wonderlandSuccess(data)
  }
  catch (error) {
    return wonderlandErrorResponse(error)
  }
}
