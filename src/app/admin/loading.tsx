export default function AdminLoading() {
  return (
    <div aria-label="正在加载管理概览" role="status" className="h-0.5 overflow-hidden bg-surface-secondary">
      <span className="sr-only">正在加载管理概览</span>
      <div className="h-full w-24 bg-accent" />
    </div>
  )
}
