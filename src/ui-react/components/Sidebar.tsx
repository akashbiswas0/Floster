import NodePalette from './NodePalette'
import AIPromptSection from './AIPromptSection'
import SimulationControls from './SimulationControls'
import type { WorkflowIR } from '../types/workflow'

interface Props {
  aiPrompt: string
  onAddNode: (type: string) => void
  onAiPromptChange: (v: string) => void
  onGenerated: (ir: WorkflowIR) => void
  onRepair: () => void
  simulationTarget?: string
}

export default function Sidebar(props: Props) {
  return (
    <aside className="w-[210px] flex-shrink-0 bg-panel border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="font-ui font-bold text-[15px] text-text-primary tracking-wide">Floster</h1>
        <p className="font-mono text-[10px] text-text-muted mt-0.5 uppercase tracking-widest">CRE Workflow Studio</p>
      </div>

      <NodePalette onAddNode={props.onAddNode} />
      <AIPromptSection
        aiPrompt={props.aiPrompt}
        onAiPromptChange={props.onAiPromptChange}
        onGenerated={props.onGenerated}
        simulationTarget={props.simulationTarget}
      />
      <SimulationControls
        onRepair={props.onRepair}
      />
    </aside>
  )
}
