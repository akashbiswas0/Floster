interface Props {
  nodeIds: string[]
  edgeFrom: string
  edgeTo: string
  onEdgeFromChange: (v: string) => void
  onEdgeToChange: (v: string) => void
  onAddEdge: () => void
}

export default function EdgeBuilder({
  nodeIds,
  edgeFrom,
  edgeTo,
  onEdgeFromChange,
  onEdgeToChange,
  onAddEdge,
}: Props) {
  const selectCls =
    'bg-bg border border-[rgba(255,255,255,0.08)] text-text-secondary font-mono text-[10px] px-2 py-[3px] outline-none cursor-pointer focus:border-accent'

  return (
    <div className="h-[46px] flex-shrink-0 bg-panel border-b border-[rgba(255,255,255,0.06)] flex items-center gap-3 px-5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">From</span>
      <select value={edgeFrom} onChange={(e) => onEdgeFromChange(e.target.value)} className={selectCls}>
        {nodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <span className="font-mono text-text-muted text-[12px]">→</span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">To</span>
      <select value={edgeTo} onChange={(e) => onEdgeToChange(e.target.value)} className={selectCls}>
        {nodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <button
        onClick={onAddEdge}
        className="ml-1 font-mono text-[10px] text-accent border border-[rgba(0,212,255,0.3)] bg-[rgba(0,212,255,0.06)] px-3 py-1 hover:bg-[rgba(0,212,255,0.12)] transition-colors cursor-pointer"
      >
        + Add Edge
      </button>
    </div>
  )
}
