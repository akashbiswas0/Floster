import NodePalette from './NodePalette'
import AIPromptSection from './AIPromptSection'
import SimulationControls from './SimulationControls'

interface Props {
  simulationTarget: string
  aiPrompt: string
  onAddNode: (type: string) => void
  onAiPromptChange: (v: string) => void
  onGenerateAI: () => void
  onSimulationTargetChange: (v: string) => void
  onValidate: () => void
  onCompile: () => void
  onSimulate: () => void
  onRepair: () => void
}

export default function Sidebar(props: Props) {
  return (
    <aside className="w-[210px] flex-shrink-0 bg-panel border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-y-auto">
      {/* Brand */}
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="font-ui font-bold text-[15px] text-text-primary tracking-wide">CRE Builder</h1>
        <p className="font-mono text-[10px] text-text-muted mt-0.5 uppercase tracking-widest">Workflow Studio</p>
      </div>

      <NodePalette onAddNode={props.onAddNode} />
      <AIPromptSection
        aiPrompt={props.aiPrompt}
        onAiPromptChange={props.onAiPromptChange}
        onGenerateAI={props.onGenerateAI}
      />
      <SimulationControls
        simulationTarget={props.simulationTarget}
        onSimulationTargetChange={props.onSimulationTargetChange}
        onValidate={props.onValidate}
        onCompile={props.onCompile}
        onSimulate={props.onSimulate}
        onRepair={props.onRepair}
      />
    </aside>
  )
}
