import Link from 'next/link'

import type { FC } from 'react'

const NotFound: FC = () => {
  return (
    <div className="flex-1 flex justify-center items-center">
      <div className="text-center">
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance text-accent sm:text-7xl">404</h1>
        <p className="mt-6 text-lg font-medium text-pretty text-gray-500 sm:text-xl/8">看来这个页面去环球旅行了，还没寄明信片回来。</p>
        <div className="flex items-center justify-center mt-10">
          <Link href="/" className="inline-flex h-9 items-center rounded-xl bg-foreground px-4 text-sm font-bold text-background transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            回到首页
          </Link>
        </div>
      </div>
    </div>
  )
}
export default NotFound
