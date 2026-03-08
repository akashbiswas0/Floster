export type IRVersion = '1.0'

export type ConsensusStrategy = 'identical' | 'median' | 'fields'

export type TriggerType = 'cron' | 'http' | 'evmLog'
export type ActionType =
  | 'httpFetch'
  | 'evmRead'
  | 'evmWrite'
  | 'evmPayoutTransfer'
  | 'transform'
  | 'consensus'

export interface RPCConfig {
  chainName: string
  url: string
}

export interface TargetConfig {
  rpcs: RPCConfig[]
  workflowOwnerAddress?: string
}

export interface RuntimeConfig {
  defaultTarget: string
  targets: Record<string, TargetConfig>
}

export interface BaseNode {
  id: string
  name: string
}

export interface CronTriggerNode extends BaseNode {
  type: 'cron'
  schedule: string
}

export interface HttpTriggerNode extends BaseNode {
  type: 'http'
  authMode?: 'none' | 'jwt'
}

export interface EvmLogTriggerNode extends BaseNode {
  type: 'evmLog'
  chainName: string
  addresses: string[]
  eventSignature?: string
}

export type TriggerNode = CronTriggerNode | HttpTriggerNode | EvmLogTriggerNode

export interface HttpFetchActionNode extends BaseNode {
  type: 'httpFetch'
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  bodyTemplate?: string
  consensus: Exclude<ConsensusStrategy, 'fields'>
}

export interface ABIField {
  name: string
  type: string
}

export interface EvmReadActionNode extends BaseNode {
  type: 'evmRead'
  chainName: string
  contractAddress: string
  functionName: string
  inputs: ABIField[]
  outputs: ABIField[]
  args?: string[]
  consensus: Exclude<ConsensusStrategy, 'fields'>
}

export interface EvmWriteActionNode extends BaseNode {
  type: 'evmWrite'
  chainName: string
  receiver: string
  payloadPath: string
  gasLimit: number
}

export interface EvmPayoutTransferActionNode extends BaseNode {
  type: 'evmPayoutTransfer'
  chainName: string
  receiverContract: string
  recipientAddress: string
  amountPath: string
  gasLimit: number
}

export interface TransformActionNode extends BaseNode {
  type: 'transform'
  template: Record<string, string>
  llmDriven?: boolean
  outputSchema?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>
}

export interface ConsensusActionNode extends BaseNode {
  type: 'consensus'
  strategy: ConsensusStrategy
  fields?: Record<string, Exclude<ConsensusStrategy, 'fields'>>
}

export type ActionNode =
  | HttpFetchActionNode
  | EvmReadActionNode
  | EvmWriteActionNode
  | EvmPayoutTransferActionNode
  | TransformActionNode
  | ConsensusActionNode

export interface Edge {
  from: string
  to: string
}

export interface WorkflowIR {
  irVersion: IRVersion
  metadata: {
    name: string
    description?: string
  }
  runtime: RuntimeConfig
  triggers: TriggerNode[]
  actions: ActionNode[]
  edges: Edge[]
  secrets?: {
    secretsNames: Record<string, string[]>
  }
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  path?: string
}

export interface ValidationResult {
  valid: boolean
  diagnostics: Diagnostic[]
}

export interface PreflightResult {
  valid: boolean
  diagnostics: Diagnostic[]
  quotas: {
    triggerCount: number
    httpActionCount: number
    evmReadCount: number
    evmWriteCount: number
  }
}

export interface SimulationCommandMetadata {
  triggerId: string
  triggerType: TriggerType
  triggerIndex: number
  command: string
}

export interface CompileResult {
  generatedFiles: string[]
  diagnostics: Diagnostic[]
  simulation: {
    interactiveCommand: string
    nonInteractive: SimulationCommandMetadata[]
  }
}

export interface SimulationRequest {
  workflowPath: string
  target: string
  triggerInput:
    | { mode: 'interactive' }
    | { mode: 'cron'; triggerIndex: number }
    | { mode: 'http'; triggerIndex: number; payload: string | Record<string, unknown> }
    | {
        mode: 'evmLog'
        triggerIndex: number
        txHash: string
        eventIndex: number
      }
}

export interface SimulationResult {
  runId: string
  command: string
  exitCode: number
  logs: Array<{ level: 'stdout' | 'stderr'; line: string }>
  result?: Record<string, unknown>
}
