import { CircleQuestion } from '@gravity-ui/icons'
import Link from 'next/link'

export default function WonderlandNotFound() {
  return (
    <div className="wonderland-full-bleed">
      <div className="wonderland-page grid min-h-[70vh] place-items-center px-4">
        <div className="wonderland-empty max-w-xl">
          <CircleQuestion className="size-10" />
          <p className="wonderland-kicker">404 / NOT FOUND</p>
          <h1>这个问题已经不在这里了</h1>
          <p>它可能被删除、隐藏，或者链接有误。</p>
          <Link href="/wonderland">返回妙妙屋</Link>
        </div>
      </div>
    </div>
  )
}
