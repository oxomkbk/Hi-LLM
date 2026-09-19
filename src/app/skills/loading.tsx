export default function SkillsLoading() {
  return (
    <div aria-label="Skills 加载中" role="status" className="skills-page skills-full-bleed w-full">
      <span className="sr-only">Skills 加载中…</span>
      <section aria-hidden="true" className="skills-hero relative isolate grid items-center overflow-hidden border-b border-border bg-background">
        <div className="skills-hero-grid absolute inset-0 -z-10" />
        <div className="skills-content grid gap-10 py-9 sm:py-12 lg:min-h-[32rem] lg:grid-cols-[1.16fr_0.84fr] lg:items-center lg:py-14">
          <div className="space-y-6">
            <div className="h-4 w-44 animate-pulse bg-surface-secondary motion-reduce:animate-none" />
            <div className="h-28 max-w-3xl animate-pulse bg-surface-secondary motion-reduce:animate-none sm:h-32" />
            <div className="h-11 max-w-xl animate-pulse bg-surface-secondary motion-reduce:animate-none" />
            <div className="h-10 w-72 max-w-full animate-pulse bg-surface-secondary motion-reduce:animate-none" />
          </div>
          <div className="h-[18.5rem] animate-pulse border-y border-border bg-surface-secondary motion-reduce:animate-none" />
        </div>
      </section>
      <section aria-hidden="true" className="skills-content py-10 sm:py-12">
        <div className="mb-7 h-10 w-40 animate-pulse bg-surface-secondary motion-reduce:animate-none" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-xl bg-surface-secondary motion-reduce:animate-none" />
          ))}
        </div>
      </section>
    </div>
  )
}
