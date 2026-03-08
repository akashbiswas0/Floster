import { buildGraph, computeExecutionOrder } from '../domain/graph.js'
import type {
  ActionNode,
  CompileResult,
  Edge,
  SimulationCommandMetadata,
  WorkflowIR,
} from '../domain/types.js'

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function sanitizeTargetName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

export interface GeneratedArtifacts {
  files: Record<string, string>
  simulation: CompileResult['simulation']
}

function buildIncomingMap(edges: Edge[]): Record<string, string[]> {
  const incoming: Record<string, string[]> = {}
  for (const edge of edges) {
    if (!incoming[edge.to]) incoming[edge.to] = []
    const bucket = incoming[edge.to]
    if (bucket) bucket.push(edge.from)
  }
  return incoming
}

function buildPipelines(ir: WorkflowIR): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const trigger of ir.triggers) {
    result[trigger.id] = computeExecutionOrder(ir, trigger.id)
  }
  return result
}

function generateMainTS(ir: WorkflowIR): string {
  const pipelines = buildPipelines(ir)
  const incomingMap = buildIncomingMap(ir.edges)

  return `import {
  bytesToHex,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  type CronPayload,
  type EVMLog,
  type HTTPPayload,
  type NodeRuntime,
  type Runtime,
} from '@chainlink/cre-sdk'
import { decodeFunctionResult, encodeFunctionData } from 'viem'

const IR = ${json(ir)} as const
const PIPELINES = ${json(pipelines)} as const
const INCOMING = ${json(incomingMap)} as const
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type WorkflowContext = {
  triggerPayload: unknown
  outputs: Record<string, unknown>
}

function deepGet(source: unknown, path: string): unknown {
  const normalized = path.replace(/^\$\./, '').replace(/^\$/, '')
  if (!normalized) return source

  let current: unknown = source
  for (const part of normalized.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function readRef(ref: string, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  if (!ref.startsWith('$')) return ref

  if (ref === '$runtime.now') {
    return runtime.now().toISOString()
  }

  if (ref.startsWith('$trigger')) {
    return deepGet(ctx.triggerPayload, ref.replace('$trigger', '$'))
  }

  if (ref.startsWith('$outputs')) {
    const outPath = ref.replace('$outputs.', '')
    const [nodeId, ...rest] = outPath.split('.')
    const base = ctx.outputs[nodeId] as unknown
    const tail = rest.length > 0 ? '$.' + rest.join('.') : '$'
    return deepGet(base, tail)
  }

  return ref
}

function normalizeHexPayload(value: unknown): string {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)) {
    return value
  }

  const asJson = JSON.stringify(value ?? {})
  const bytes = Buffer.from(asJson, 'utf8')
  return ('0x' + bytes.toString('hex')) as string
}

function aggregate(strategy: string, input: unknown): unknown {
  if (!Array.isArray(input)) return input

  if (strategy === 'identical') {
    const first = JSON.stringify(input[0])
    for (const next of input) {
      if (JSON.stringify(next) !== first) {
        throw new Error('consensus.identical failed: inputs differ')
      }
    }
    return input[0]
  }

  if (strategy === 'median') {
    const numeric = input
      .map((item) => Number(item))
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => a - b)

    if (numeric.length === 0) return input[0]
    return numeric[Math.floor(numeric.length / 2)]
  }

  return input[0]
}

function coerceArgs(inputTypes: ReadonlyArray<{ type: string }>, raw: unknown[]): unknown[] {
  return raw.map((value, index) => {
    const type = inputTypes[index]?.type ?? ''
    if ((type.startsWith('uint') || type.startsWith('int')) && typeof value === 'string') {
      return BigInt(value)
    }
    return value
  })
}

function applyTemplate(
  template: string,
  runtime: Runtime<unknown>,
  ctx: WorkflowContext,
): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, raw) => {
    const value = readRef(raw.trim(), runtime, ctx)
    return value === undefined ? '' : String(value)
  })
}

function runHttpFetch(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const httpClient = new cre.capabilities.HTTPClient()

  const execute = (nodeRuntime: NodeRuntime<unknown>) => {
    const req = {
      method: node.method,
      url: applyTemplate(node.url, runtime, ctx),
      headers: node.headers ?? {},
      body: node.bodyTemplate
        ? Buffer.from(applyTemplate(node.bodyTemplate, runtime, ctx), 'utf8').toString('base64')
        : undefined,
    }

    const response = httpClient.sendRequest(nodeRuntime, req).result()
    const text = Buffer.from(response.body).toString('utf8')

    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: parsed,
    }
  }

  const consensus =
    node.consensus === 'median'
      ? consensusMedianAggregation<unknown>()
      : consensusIdenticalAggregation<unknown>()

  return runtime.runInNodeMode(execute, consensus)().result()
}

function runEvmRead(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const network =
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: true }) ||
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: false })

  if (!network) {
    throw new Error('Network not found for ' + node.chainName)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const abi = [
    {
      type: 'function',
      name: node.functionName,
      stateMutability: 'view',
      inputs: node.inputs,
      outputs: node.outputs,
    },
  ] as const

  const args = (node.args ?? []).map((arg: string) => readRef(arg, runtime, ctx))

  const callData = encodeFunctionData({
    abi,
    functionName: node.functionName,
    args: coerceArgs(node.inputs, args),
  })

  const raw = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: ZERO_ADDRESS,
        to: node.contractAddress,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  return decodeFunctionResult({
    abi,
    functionName: node.functionName,
    data: bytesToHex(raw.data),
  })
}

function runEvmWrite(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const network =
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: true }) ||
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: false })

  if (!network) {
    throw new Error('Network not found for ' + node.chainName)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const payloadRaw = readRef(node.payloadPath, runtime, ctx)
  const payloadHex = normalizeHexPayload(payloadRaw)

  const report = runtime
    .report({
      encodedPayload: hexToBase64(payloadHex),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  const response = evmClient
    .writeReport(runtime, {
      receiver: node.receiver,
      report,
      gasConfig: {
        gasLimit: String(node.gasLimit),
      },
    })
    .result()

  return {
    txStatus: response.txStatus,
    txHash: bytesToHex(response.txHash || new Uint8Array(32)),
    errorMessage: response.errorMessage || '',
  }
}

function runTransform(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.template ?? {})) {
    output[key] = readRef(value, runtime, ctx)
  }
  return output
}

function runConsensus(node: any, inputs: unknown[]): unknown {
  if (node.strategy !== 'fields') {
    return aggregate(node.strategy, inputs)
  }

  const first = (inputs[0] ?? {}) as Record<string, unknown>
  const fields = node.fields ?? {}
  const out: Record<string, unknown> = {}

  for (const [fieldName, strategy] of Object.entries(fields)) {
    const bucket = inputs.map((item) => (item as Record<string, unknown>)?.[fieldName])
    out[fieldName] = aggregate(strategy as string, bucket)
  }

  for (const [fieldName, value] of Object.entries(first)) {
    if (!(fieldName in out)) out[fieldName] = value
  }

  return out
}

function executeAction(
  node: any,
  runtime: Runtime<unknown>,
  ctx: WorkflowContext,
  input: unknown[],
): unknown {
  switch (node.type) {
    case 'httpFetch':
      return runHttpFetch(node, runtime, ctx)
    case 'evmRead':
      return runEvmRead(node, runtime, ctx)
    case 'evmWrite':
      return runEvmWrite(node, runtime, ctx)
    case 'transform':
      return runTransform(node, runtime, ctx)
    case 'consensus':
      return runConsensus(node, input)
    default:
      throw new Error('Unsupported node type: ' + node.type)
  }
}

function runPipeline(runtime: Runtime<unknown>, triggerId: string, payload: unknown): string {
  const ctx: WorkflowContext = {
    triggerPayload: payload,
    outputs: {},
  }

  const actions = new Map(IR.actions.map((action) => [action.id, action]))
  const ordered = PIPELINES[triggerId] ?? []

  runtime.log('Running pipeline for trigger ' + triggerId)

  for (const actionId of ordered) {
    const action = actions.get(actionId)
    if (!action) continue

    const incoming = INCOMING[actionId] ?? []
    const input = incoming.map((id) => {
      if (id === triggerId) return payload
      return ctx.outputs[id]
    })

    const output = executeAction(action, runtime, ctx, input)
    ctx.outputs[actionId] = output

    runtime.log('Action completed: ' + actionId)
  }

  return JSON.stringify(
    {
      triggerId,
      outputs: ctx.outputs,
    },
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  )
}

function initWorkflow() {
  const handlers: ReturnType<typeof cre.handler>[] = []

  for (const trigger of IR.triggers) {
    if (trigger.type === 'cron') {
      const cron = new cre.capabilities.CronCapability()
      handlers.push(
        cre.handler(
          cron.trigger({ schedule: trigger.schedule }),
          (runtime: Runtime<unknown>, payload: CronPayload) => runPipeline(runtime, trigger.id, payload),
        ),
      )
      continue
    }

    if (trigger.type === 'http') {
      const http = new cre.capabilities.HTTPCapability()
      handlers.push(
        cre.handler(
          http.trigger({}),
          (runtime: Runtime<unknown>, payload: HTTPPayload) => runPipeline(runtime, trigger.id, payload),
        ),
      )
      continue
    }

    if (trigger.type === 'evmLog') {
      const network =
        getNetwork({ chainFamily: 'evm', chainSelectorName: trigger.chainName, isTestnet: true }) ||
        getNetwork({ chainFamily: 'evm', chainSelectorName: trigger.chainName, isTestnet: false })
      if (!network) throw new Error('Network not found for trigger: ' + trigger.chainName)

      const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
      handlers.push(
        cre.handler(
          evmClient.logTrigger({
            addresses: trigger.addresses.map((addr) => hexToBase64(addr)),
          }),
          (runtime: Runtime<unknown>, payload: EVMLog) => runPipeline(runtime, trigger.id, payload),
        ),
      )
      continue
    }
  }

  return handlers
}

export async function main() {
  const runner = await Runner.newRunner()
  await runner.run(initWorkflow)
}

main()
`
}

function generateWorkflowYAML(ir: WorkflowIR): string {
  const targets = Object.keys(ir.runtime.targets)

  const lines: string[] = [
    '# Auto-generated by cre-local-builder',
    '# Local simulation only',
  ]

  for (const target of targets) {
    const safe = sanitizeTargetName(target)
    const secretsPath = ir.secrets ? '../secrets.yaml' : ''
    lines.push(`${target}:`)
    lines.push(`  user-workflow:`)
    lines.push(`    workflow-name: "${ir.metadata.name}-${safe}"`)
    lines.push(`  workflow-artifacts:`)
    lines.push(`    workflow-path: "./main.ts"`)
    lines.push(`    config-path: "./config.${safe}.json"`)
    lines.push(`    secrets-path: "${secretsPath}"`)
  }

  return lines.join('\n') + '\n'
}

function generateProjectYAML(ir: WorkflowIR): string {
  const lines: string[] = ['# Auto-generated by cre-local-builder']

  for (const [target, cfg] of Object.entries(ir.runtime.targets)) {
    lines.push(`${target}:`)
    if (cfg.workflowOwnerAddress) {
      lines.push(`  account:`)
      lines.push(`    workflow-owner-address: "${cfg.workflowOwnerAddress}"`)
    }

    lines.push('  rpcs:')
    for (const rpc of cfg.rpcs) {
      lines.push(`    - chain-name: ${rpc.chainName}`)
      lines.push(`      url: ${rpc.url}`)
    }
  }

  return lines.join('\n') + '\n'
}

function generatePackageJSON(): string {
  return json({
    name: 'generated-cre-workflow',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx main.ts',
      test: 'echo "No tests generated"',
    },
    dependencies: {
      '@chainlink/cre-sdk': '^1.1.2',
      viem: '^2.39.0',
    },
    devDependencies: {
      tsx: '^4.20.5',
      typescript: '^5.9.2',
    },
  })
}

function generateTSConfig(): string {
  return json({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['main.ts'],
  })
}

function generateConfigJSON(ir: WorkflowIR, target: string): string {
  return json({
    generatedAt: new Date('2026-03-08T00:00:00.000Z').toISOString(),
    workflowName: ir.metadata.name,
    target,
    irVersion: ir.irVersion,
  })
}

function generateSecretsYAML(ir: WorkflowIR): string | null {
  if (!ir.secrets) return null

  const lines: string[] = ['secretsNames:']
  for (const [logical, envNames] of Object.entries(ir.secrets.secretsNames)) {
    lines.push(`  ${logical}:`)
    for (const envName of envNames) {
      lines.push(`    - ${envName}`)
    }
  }

  return lines.join('\n') + '\n'
}

function generateSimulationMetadata(ir: WorkflowIR): CompileResult['simulation'] {
  const interactiveCommand = `cre workflow simulate . --target ${ir.runtime.defaultTarget}`

  const nonInteractive: SimulationCommandMetadata[] = []
  for (const [index, trigger] of ir.triggers.entries()) {
    let command = `cre workflow simulate . --non-interactive --trigger-index ${index} --target ${ir.runtime.defaultTarget}`

    if (trigger.type === 'http') {
      command += ` --http-payload @./payloads/${trigger.id}.json`
    }

    if (trigger.type === 'evmLog') {
      command += ' --evm-tx-hash <tx-hash> --evm-event-index <event-index>'
    }

    nonInteractive.push({
      triggerId: trigger.id,
      triggerType: trigger.type,
      triggerIndex: index,
      command,
    })
  }

  return { interactiveCommand, nonInteractive }
}

export function generateArtifacts(ir: WorkflowIR): GeneratedArtifacts {
  const files: Record<string, string> = {
    'main.ts': generateMainTS(ir),
    'workflow.yaml': generateWorkflowYAML(ir),
    'project.yaml': generateProjectYAML(ir),
    'package.json': generatePackageJSON(),
    'tsconfig.json': generateTSConfig(),
    '.env.example': 'CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001\n',
  }

  for (const target of Object.keys(ir.runtime.targets)) {
    const safe = sanitizeTargetName(target)
    files[`config.${safe}.json`] = generateConfigJSON(ir, target)
  }

  const secretsYaml = generateSecretsYAML(ir)
  if (secretsYaml) {
    files['secrets.yaml'] = secretsYaml
  }

  return {
    files,
    simulation: generateSimulationMetadata(ir),
  }
}

export function listReachableActions(ir: WorkflowIR, triggerId: string): ActionNode[] {
  const order = computeExecutionOrder(ir, triggerId)
  const actions = new Map(ir.actions.map((a) => [a.id, a]))
  return order.map((id) => actions.get(id)).filter((a): a is ActionNode => Boolean(a))
}

export function graphStats(ir: WorkflowIR): { nodes: number; edges: number } {
  const graph = buildGraph(ir)
  return {
    nodes: graph.nodeIds.size,
    edges: ir.edges.length,
  }
}
