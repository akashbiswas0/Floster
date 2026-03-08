const IconPlay = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)

interface Props {
  simulationTarget: string
  modeLabel: string
  modeDotColor: string
  onSimulationTargetChange: (v: string) => void
  onSimulate: () => void
}

export default function CanvasToolbar({ simulationTarget, modeLabel, modeDotColor, onSimulationTargetChange, onSimulate }: Props) {
  return (
    <div className="h-10 flex-shrink-0 bg-[rgba(255,255,255,0.015)] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-4">
      {/* Mode status dot + label — left side */}
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-[pulse-opacity_2s_ease-in-out_infinite]"
          style={{ backgroundColor: modeDotColor }}
        />
        {modeLabel}
      </span>

      {/* Simulation target dropdown + Simulate button — right side */}
      <div className="flex items-center gap-2">
        <select
          value={simulationTarget}
          onChange={(e) => onSimulationTargetChange(e.target.value)}
          className="bg-bg border border-[rgba(255,255,255,0.08)] text-text-secondary font-mono text-[11px] px-2 py-1 focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="local-simulation">Dry Run</option>
          <option value="sepolia-broadcast">Broadcast to Sepolia</option>
        </select>

        <button
          onClick={onSimulate}
          className="flex items-center gap-1.5 bg-transparent border border-[rgba(0,229,160,0.3)] text-success font-mono text-[11px] px-3 py-1 cursor-pointer transition-all duration-150 hover:bg-[rgba(0,229,160,0.08)] hover:border-[rgba(0,229,160,0.5)]"
        >
          <IconPlay />
          Simulate
        </button>
      </div>
    </div>
  )
}
