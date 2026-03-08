export interface TargetConfig {
  rpcs: { chainName: string; url: string }[]
  broadcast: boolean
  receiverContract: string
  chainExplorerTxBaseUrl: string
}

export interface RuntimeConfig {
  defaultTarget: string
  targets: Record<string, TargetConfig>
}

export interface WorkflowNode {
  id: string
  name: string
  type: string
  [key: string]: unknown
}

export interface Edge {
  from: string
  to: string
  fromSide?: 'left' | 'right'
  toSide?: 'left' | 'right'
}

export interface WorkflowIR {
  irVersion: string
  metadata: { name: string; description: string }
  runtime: RuntimeConfig
  triggers: WorkflowNode[]
  actions: WorkflowNode[]
  edges: Edge[]
}

export interface NodePosition {
  x: number
  y: number
}

export interface DraggingNodeState {
  id: string
  startClientX: number
  startClientY: number
  origX: number
  origY: number
  moved: boolean
}
