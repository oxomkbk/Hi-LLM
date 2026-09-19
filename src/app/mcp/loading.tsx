export default function McpLoading() {
  return (
    <div className="mcp-page mcp-full-bleed grid min-h-[calc(100svh-4rem)] place-items-center bg-[#f5f8fc] px-4">
      <div className="text-center">
        <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-[#dce6f2] border-t-[#0b6ef3] motion-reduce:animate-none" />
        <p className="mt-4 font-mono text-[9px] tracking-[.14em] text-[#718096] uppercase">Scanning protocol nodes…</p>
      </div>
    </div>
  )
}
