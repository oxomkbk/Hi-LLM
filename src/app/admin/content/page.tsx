import { Suspense } from 'react'

import ContentCenter from './content-center'

export default function AdminContentPage() {
  return (
    <Suspense fallback={<div className="grid min-h-80 place-items-center text-sm text-muted">正在加载内容中心…</div>}>
      <ContentCenter />
    </Suspense>
  )
}
