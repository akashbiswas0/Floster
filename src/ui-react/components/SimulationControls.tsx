// Inline SVG icons for action buttons
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconFile = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconSparkle = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/>
  </svg>
)

interface Props {
  onValidate: () => void
  onCompile: () => void
  onRepair: () => void
}

export default function SimulationControls({ onValidate, onCompile, onRepair }: Props) {
  return (
    <section className="px-3 pt-2 pb-4 border-t border-[rgba(255,255,255,0.06)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-2 px-1">Actions</p>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={onValidate}
          className="flex items-center gap-2 w-full bg-transparent border border-[rgba(255,181,71,0.25)] text-warning font-mono text-[11px] px-[10px] py-[7px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(255,181,71,0.07)]"
        >
          <IconCheck /> Validate + Preflight
        </button>
        <button
          onClick={onCompile}
          className="flex items-center gap-2 w-full bg-transparent border border-[rgba(255,255,255,0.08)] text-text-secondary font-mono text-[11px] px-[10px] py-[7px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(255,255,255,0.04)]"
        >
          <IconFile /> Generate Files
        </button>
        <button
          onClick={onRepair}
          className="flex items-center gap-2 w-full bg-transparent border border-[rgba(124,106,255,0.25)] text-purple font-mono text-[11px] px-[10px] py-[7px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(124,106,255,0.07)]"
        >
          <IconSparkle /> AI Repair IR
        </button>
      </div>
    </section>
  )
}
