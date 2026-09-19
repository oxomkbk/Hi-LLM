import { ArrowLeft, Lock } from '@gravity-ui/icons'
import Link from 'next/link'

export default function SubmissionUnavailable({
  backHref,
  backLabel,
  channelLabel,
}: {
  backHref: string
  backLabel: string
  channelLabel: string
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-5 py-16 sm:px-8">
      <section className="w-full rounded-2xl border border-border bg-surface px-6 py-10 text-center shadow-sm sm:px-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-secondary text-muted">
          <Lock aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-5 text-xs font-bold tracking-[0.16em] text-muted uppercase">暂未开放</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.04em]">
          {channelLabel}
          投稿暂未开放
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">管理员暂时关闭了这个投稿入口，你仍然可以继续浏览社区内容。</p>
        <Link href={backHref} className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background transition-opacity hover:opacity-80">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {backLabel}
        </Link>
      </section>
    </main>
  )
}
