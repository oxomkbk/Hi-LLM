import { safeReturnTo } from '@/lib/navigation/return-context'

import WonderlandNewsEditor from '../../../components/wonderland/news-editor'

export default async function AdminWonderlandNewsCreatePage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const query = await searchParams
  const returnHref = safeReturnTo(query.returnTo, '/admin/wonderland/news', {
    exactPathnames: ['/admin/wonderland/news'],
  })
  return <WonderlandNewsEditor returnHref={returnHref} />
}
