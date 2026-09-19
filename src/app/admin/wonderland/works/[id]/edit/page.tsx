import { safeReturnTo } from '@/lib/navigation/return-context'

import WonderlandWorkEditor from '../../../../components/wonderland/work-editor'

export default async function AdminWonderlandWorkEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnHref = safeReturnTo(query.returnTo, '/admin/wonderland/works', {
    exactPathnames: ['/admin/wonderland/works'],
  })
  return <WonderlandWorkEditor returnHref={returnHref} workId={id} />
}
