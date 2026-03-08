interface Props {
  simulationTarget: string
  onSimulationTargetChange: (v: string) => void
  onValidate: () => void
  onCompile: () => void
  onSimulate: () => void
  onRepair: () => void
}

export default function SimulationControls({
  simulationTarget,
  onSimulationTargetChange,
  onValidate,
  onCompile,
  onSimulate,
  onRepair,
}: Props) {
  return (
    <section className="px-3 pt-2 pb-4 border-t border-[rgba(255,255,255,0.06)]">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted mb-2 px-1">Simulation Mode</p>
      <select
        value={simulationTarget}
        onChange={(e) => onSimulationTargetChange(e.target.value)}
        className="w-full bg-bg border border-[rgba(255,255,255,0.08)] text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer mb-3"
      >
        <option value="local-simulation">Dry Run</option>
        <option value="sepolia-broadcast">Broadcast to Sepolia</option>
      </select>

      <div className="flex flex-col gap-1.5">
        <button
          onClick={onValidate}
          className="block w-full bg-transparent border border-[rgba(255,181,71,0.25)] text-warning font-mono text-[10px] px-[10px] py-[6px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(255,181,71,0.07)]"
        >
          ⬡ Validate + Preflight
        </button>
        <button
          onClick={onCompile}
          className="block w-full bg-transparent border border-[rgba(255,255,255,0.08)] text-text-secondary font-mono text-[10px] px-[10px] py-[6px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(255,255,255,0.04)]"
        >
          ◻ Generate Files
        </button>
        <button
          onClick={onSimulate}
          className="block w-full bg-transparent border border-[rgba(0,229,160,0.25)] text-success font-mono text-[10px] px-[10px] py-[6px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(0,229,160,0.07)]"
        >
          ▶ Simulate (Interactive)
        </button>
        <button
          onClick={onRepair}
          className="block w-full bg-transparent border border-[rgba(124,106,255,0.25)] text-purple font-mono text-[10px] px-[10px] py-[6px] cursor-pointer transition-all duration-150 text-left hover:bg-[rgba(124,106,255,0.07)]"
        >
          ✦ AI Repair IR
        </button>
      </div>
    </section>
  )
}
