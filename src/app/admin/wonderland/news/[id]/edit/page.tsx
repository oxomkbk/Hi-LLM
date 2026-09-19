import { safeReturnTo } from '@/lib/navigation/return-context'

import WonderlandNewsEditor from '../../../../components/wonderland/news-editor'

export default async function AdminWonderlandNewsEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/wonderland/news', {
    exactPathnames: ['/admin/wonderland/news'],
  })
  return <WonderlandNewsEditor articleId={id} returnHref={returnHref} />
}
