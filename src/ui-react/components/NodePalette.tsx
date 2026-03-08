interface PaletteEntry {
  type: string
  label: string
  icon: string
  colorClass: string
}

const TRIGGERS: PaletteEntry[] = [
  { type: 'cron',   label: 'Cron Trigger',    icon: '⏱', colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
  { type: 'http',   label: 'HTTP Trigger',    icon: '🌐', colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
  { type: 'evmLog', label: 'EVM Log Trigger', icon: '⛓', colorClass: 'bg-[rgba(255,78,106,0.15)] text-danger' },
]

const ACTIONS: PaletteEntry[] = [
  { type: 'httpFetch',     label: 'HTTP Fetch',     icon: '↓', colorClass: 'bg-[rgba(0,212,255,0.12)] text-accent' },
  { type: 'evmRead',       label: 'EVM Read',       icon: '📖', colorClass: 'bg-[rgba(124,106,255,0.15)] text-purple' },
  { type: 'evmWrite',      label: 'EVM Write',      icon: '✎', colorClass: 'bg-[rgba(124,106,255,0.15)] text-purple' },
  { type: 'erc20Transfer', label: 'ERC20 Transfer', icon: '◈', colorClass: 'bg-[rgba(0,229,160,0.12)] text-success' },
  { type: 'transform',     label: 'Transform',      icon: '⇄', colorClass: 'bg-[rgba(255,181,71,0.12)] text-warning' },
  { type: 'consensus',     label: 'Consensus',      icon: '⊕', colorClass: 'bg-[rgba(255,181,71,0.12)] text-warning' },
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
      className="flex items-center gap-[7px] w-full bg-transparent border border-[rgba(255,255,255,0.06)] text-text-secondary text-[12px] font-ui px-[7px] py-[5px] cursor-grab transition-all duration-150 text-left hover:translate-x-[2px] hover:border-[rgba(255,255,255,0.14)] hover:bg-surface-hover hover:text-text-primary"
    >
      <span className={`inline-flex items-center justify-center w-[22px] h-[22px] text-[11px] flex-shrink-0 ${entry.colorClass}`}>
        {entry.icon}
      </span>
      <span className="flex-1">{entry.label}</span>
      <span className="text-text-muted text-[13px]">+</span>
    </button>
  )
}

export default function NodePalette({ onAddNode }: Props) {
  return (
    <section className="px-3 pt-3 pb-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted mb-2 px-1">Node Palette</p>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-muted px-1 pt-1">Triggers</p>
        {TRIGGERS.map((e) => <PaletteButton key={e.type} entry={e} onAddNode={onAddNode} />)}
        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-muted px-1 pt-2">Actions</p>
        {ACTIONS.map((e) => <PaletteButton key={e.type} entry={e} onAddNode={onAddNode} />)}
      </div>
    </section>
  )
}
