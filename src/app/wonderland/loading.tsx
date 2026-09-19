export default function WonderlandLoading() {
  return (
    <div className="wonderland-full-bleed wonderland-page min-h-screen">
      <div className="wonderland-content py-20">
        <div className="h-4 w-32 animate-pulse bg-[#ddd6cb]" />
        <div className="mt-5 h-24 max-w-2xl animate-pulse bg-[#e4ded5]" />
        <div className="mt-16 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
          <div className="h-96 animate-pulse bg-white" />
          <div className="h-72 animate-pulse bg-[#e4ded5]" />
        </div>
      </div>
    </div>
  )
}
