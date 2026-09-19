import { promptSuccess } from '@/lib/prompts/http'
import { promptRepository } from '@/lib/repositories/prompts'

export async function GET() {
  try {
    return promptSuccess(await promptRepository.listCategories({ activeOnly: true }), '分类已加载', 200, { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' })
  }
  catch {
    return promptSuccess([], '分类暂时不可用', 200, { 'Cache-Control': 'no-store' })
  }
}
