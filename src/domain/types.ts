export type IRVersion = '1.0'

export type ConsensusStrategy = 'identical' | 'median' | 'fields'

export type TriggerType = 'cron' | 'http' | 'evmLog'
export type ActionType =
  | 'httpFetch'
  | 'confidentialHttp'
  | 'evmRead'
  | 'evmWrite'
  | 'erc20Transfer'
  | 'transform'
  | 'consensus'
  | 'x402'

export interface RPCConfig {
  chainName: string
  url: string
}

export interface TargetConfig {
  rpcs: RPCConfig[]
  workflowOwnerAddress?: string
  broadcast?: boolean
  receiverContract?: string
  chainExplorerTxBaseUrl?: string
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

export interface ConfidentialHttpActionNode extends BaseNode {
  type: 'confidentialHttp'
  method: 'GET' | 'POST'
  url: string
  apiKeySecret: string
  owner?: string
  encryptOutput?: 'true' | 'false'
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

export interface Erc20TransferActionNode extends BaseNode {
  type: 'erc20Transfer'
  chainName: string
  tokenAddress: string
  receiverContract: string
  recipientAddress: string
  tokenDecimals: number
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

export interface X402ActionNode extends BaseNode {
  type: 'x402'
  url: string
  method: 'GET' | 'POST'
  bodyTemplate?: string
  walletKeyEnvVar: string
  network: string
  maxAmountUsd: number
}

export type ActionNode =
  | HttpFetchActionNode
  | ConfidentialHttpActionNode
  | EvmReadActionNode
  | EvmWriteActionNode
  | Erc20TransferActionNode
  | TransformActionNode
  | ConsensusActionNode
  | X402ActionNode

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
  broadcast?: boolean
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
