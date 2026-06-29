export default function BundlesPage() {
  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Bundles</strong>
        </div>
      </div>
      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Product bundles</div>
            <h1 className="text-3xl font-medium tracking-tight">Bundles</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">0 bundles · template</div>
          </div>
          <button disabled className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] opacity-50 cursor-not-allowed">+ New Bundle (coming soon)</button>
        </div>

        <div className="bg-[#F5EDD6] border border-[#B8860B] rounded p-4 mb-6 text-sm text-[#3D3D3D]">
          <strong className="font-mono text-[10px] uppercase tracking-wider text-[#B8860B]">How bundles will work</strong>
          <p className="mt-2">A bundle is a sellable SKU that depletes multiple FG SKUs per sale. Two types planned:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Fixed Bundle</strong>: 1 sale = fixed qty of fixed SKUs (e.g., B3F1 = 4 × TPD-BC-50)</li>
            <li><strong>Mix & Match</strong>: 1 sale = customer picks from a pool, total qty fixed (e.g., B4F2 = 6 boxes from any DH flavour)</li>
          </ul>
        </div>

        <div className="bg-white border border-[#D4D0C7] rounded p-16 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#B8860B] bg-[#F5EDD6] inline-block px-2 py-1 rounded mb-4">Template</div>
          <div className="text-base text-[#3D3D3D]">Bundle definitions table coming next iteration.</div>
        </div>
      </div>
    </div>
  )
}