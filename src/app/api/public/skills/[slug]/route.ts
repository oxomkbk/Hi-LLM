import { NextResponse } from 'next/server'

import { skillRepository } from '@/lib/repositories/skills'
import { createSkillSlug } from '@/lib/skills'
import { RESPONSE, responseMessage } from '@/lib/utils'

const PUBLIC_SKILLS_ERROR = 'Skills 数据暂时不可用，请稍后重试'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: rawSlug } = await params
    const slug = createSkillSlug(rawSlug)
    if (slug !== rawSlug)
      return NextResponse.json(responseMessage(null, 'Skill 地址无效', RESPONSE.ERROR), { status: 400 })

    const skill = await skillRepository.findPublishedBySlug(slug)
    if (!skill)
      return NextResponse.json(responseMessage(null, 'Skill 不存在', RESPONSE.ERROR), { status: 404 })

    const related = await skillRepository.listRelated(skill, 4)

    return NextResponse.json(responseMessage({ skill, related }), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  catch {
    return NextResponse.json(responseMessage(null, PUBLIC_SKILLS_ERROR, RESPONSE.ERROR), { status: 500 })
  }
}
