export default function Loading() {
  return (
    <div aria-label="页面加载中" role="status" className="flex-1 flex justify-center items-center">
      <div className="flex flex-col items-center gap-2">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        <p className="text-xs font-black text-muted">加载中...</p>
      </div>
    </div>
  )
}
