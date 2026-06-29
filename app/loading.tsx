// Global loading skeleton — shown immediately while any page's server-side data fetches.
// Next.js uses this automatically when navigating to any route without its own loading.tsx.

export default function GlobalLoading() {
  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10">
        <div className="h-3 w-40 bg-[#E8E5DE] rounded animate-pulse" />
      </div>
      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div className="h-3 w-24 bg-[#E8E5DE] rounded animate-pulse mb-2" />
          <div className="h-8 w-72 bg-[#E8E5DE] rounded animate-pulse" />
          <div className="h-3 w-48 bg-[#E8E5DE] rounded animate-pulse mt-2" />
        </div>

        {/* Generic content grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border border-[#D4D0C7] rounded p-3 bg-white">
              <div className="h-2.5 w-16 bg-[#E8E5DE] rounded animate-pulse mb-2" />
              <div className="h-6 w-24 bg-[#E8E5DE] rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
          <div className="border-b border-[#D4D0C7] bg-[#FAFAF7] px-4 py-3 flex gap-6">
            {[80, 120, 60, 100, 80, 70, 90].map((w, i) => (
              <div key={i} className="h-2.5 bg-[#E8E5DE] rounded animate-pulse" style={{ width: w }} />
            ))}
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(row => (
            <div key={row} className="border-b border-[#F0EDE4] px-4 py-3.5 flex gap-6 items-center">
              {[80, 160, 60, 80, 80, 60, 90].map((w, i) => (
                <div key={i} className="h-3 bg-[#E8E5DE] rounded animate-pulse" style={{ width: w, opacity: 1 - row * 0.08 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
