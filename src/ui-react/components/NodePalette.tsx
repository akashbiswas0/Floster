// ── Inline SVG icons ────────────────────────────────────────────────────────
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)
const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconPencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)
const IconShuffle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
    <line x1="4" y1="4" x2="9" y2="9"/>
  </svg>
)
const IconNetwork = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
    <line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
  </svg>
)

interface PaletteEntry {
  type: string
  label: string
  icon: React.ReactNode
  colorClass: string
}

const TRIGGERS: PaletteEntry[] = [
  { type: 'cron',   label: 'Cron Trigger',    icon: <IconClock />,  colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
  { type: 'http',   label: 'HTTP Trigger',    icon: <IconGlobe />,  colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
  { type: 'evmLog', label: 'EVM Log Trigger', icon: <IconLink />,   colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
]

const ACTIONS: PaletteEntry[] = [
  { type: 'httpFetch',     label: 'HTTP Fetch',     icon: <IconDownload />, colorClass: 'bg-[rgba(0,212,255,0.12)] text-accent' },
  { type: 'evmRead',       label: 'EVM Read',       icon: <IconEye />,      colorClass: 'bg-[rgba(124,106,255,0.15)] text-purple' },
  { type: 'evmWrite',      label: 'EVM Write',      icon: <IconPencil />,   colorClass: 'bg-[rgba(124,106,255,0.15)] text-purple' },
  { type: 'erc20Transfer', label: 'ERC20 Transfer', icon: <IconSend />,     colorClass: 'bg-[rgba(0,229,160,0.12)] text-success' },
  { type: 'transform',     label: 'Transform',      icon: <IconShuffle />,  colorClass: 'bg-[rgba(255,181,71,0.12)] text-warning' },
  { type: 'consensus',     label: 'Consensus',      icon: <IconNetwork />,  colorClass: 'bg-[rgba(255,181,71,0.12)] text-warning' },
]

interface Props {
  onAddNode: (type: string) => void
}

function PaletteButton({ entry, onAddNode }: { entry: PaletteEntry; onAddNode: (type: string) => void }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', entry.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={() => onAddNode(entry.type)}
      className="flex items-center gap-[7px] w-full bg-transparent border border-[rgba(255,255,255,0.06)] text-text-secondary text-[13px] font-ui px-[7px] py-[6px] cursor-grab transition-all duration-150 text-left hover:translate-x-[2px] hover:border-[rgba(255,255,255,0.14)] hover:bg-surface-hover hover:text-text-primary"
    >
      <span className={`inline-flex items-center justify-center w-[24px] h-[24px] flex-shrink-0 ${entry.colorClass}`}>
        {entry.icon}
      </span>
      <span className="flex-1">{entry.label}</span>
      <span className="text-text-muted text-[14px]">+</span>
    </button>
  )
}

export default function NodePalette({ onAddNode }: Props) {
  return (
    <section className="px-3 pt-3 pb-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted mb-2 px-1">Node Palette</p>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted px-1 pt-1">Triggers</p>
        {TRIGGERS.map((e) => <PaletteButton key={e.type} entry={e} onAddNode={onAddNode} />)}
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted px-1 pt-2">Actions</p>
        {ACTIONS.map((e) => <PaletteButton key={e.type} entry={e} onAddNode={onAddNode} />)}
      </div>
    </section>
  )
}
