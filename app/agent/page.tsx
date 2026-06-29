import { AgentChat } from '@/components/AgentChat'
import { COMPANY_NAME } from '@/lib/config'

export const dynamic = 'force-dynamic'

export default function AgentPage() {
  const hasKey = !!process.env.DEEPSEEK_API_KEY

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          {COMPANY_NAME} · <strong className="text-[#1A1A1A]">Agent</strong>
        </div>
      </div>

      <div className="px-4 sm:px-7 py-4 sm:py-6 max-w-[1800px]">
        <div className="flex justify-between items-end pb-3 sm:pb-3.5 mb-4 sm:mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              Primary interface
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">
              Supply Chain Agent
            </h1>
            <div className="text-xs sm:text-sm text-[#6B6B6B] mt-1">
              Role-aware AI assistant · Daily brief + Q&amp;A
            </div>
          </div>
        </div>

        {hasKey ? (
          <AgentChat />
        ) : (
          <DemoModeNotice />
        )}
      </div>
    </div>
  )
}

function DemoModeNotice() {
  return (
    <div className="bg-white border border-[#D4D0C7] rounded p-6 sm:p-10 max-w-2xl">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#C8432C] mb-3">
        Demo mode
      </div>
      <h2 className="text-xl font-medium mb-3">AI Agent is not configured</h2>
      <p className="text-sm text-[#3D3D3D] mb-4 leading-relaxed">
        This template ships with the agent UI but without an LLM key, so the
        chat is disabled. To enable it in your own deployment:
      </p>
      <ol className="text-sm text-[#3D3D3D] space-y-2 list-decimal pl-5 mb-5">
        <li>
          Get an API key from{' '}
          <a className="text-[#C8432C] underline" href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">
            DeepSeek
          </a>{' '}
          (or any OpenAI-compatible provider — see <code className="bg-[#FAFAF7] px-1 rounded text-[12px]">lib/agent-tools.ts</code>)
        </li>
        <li>
          Add <code className="bg-[#FAFAF7] px-1 rounded text-[12px]">DEEPSEEK_API_KEY</code> to your Vercel project environment variables
        </li>
        <li>Redeploy — the agent panel will replace this notice automatically</li>
      </ol>
      <p className="text-xs text-[#6B6B6B]">
        Everything else in the template — Dashboard, Inventory, POs, Alerts, Stock Movements —
        works without an API key.
      </p>
    </div>
  )
}
