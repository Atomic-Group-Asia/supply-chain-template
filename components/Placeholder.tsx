export function Placeholder({ section, name, hint }: { section: string; name: string; hint?: string }) {
  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">{name}</strong>
        </div>
      </div>
      <div className="px-7 py-6 max-w-[1600px]">
        <div className="pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">{section}</div>
          <h1 className="text-3xl font-medium tracking-tight">{name}</h1>
        </div>
        <div className="bg-white border border-[#D4D0C7] rounded-md p-16 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#B8860B] bg-[#F5EDD6] inline-block px-2 py-1 rounded mb-4">Coming Soon</div>
          <div className="text-base text-[#3D3D3D] mb-2">This module is planned but not yet built.</div>
          {hint && <div className="text-sm text-[#6B6B6B] mt-2 max-w-md mx-auto">{hint}</div>}
        </div>
      </div>
    </div>
  )
}