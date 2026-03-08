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
  const firstTarget = ir.runtime.targets[ir.runtime.defaultTarget]

  return `import {
  bytesToHex,
  ConfidentialHTTPClient,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  Runner,
  type ConfidentialHTTPSendRequester,
  type CronPayload,
  type EVMLog,
  type HTTPPayload,
  type NodeRuntime,
  type Runtime,
} from '@chainlink/cre-sdk'
import { decodeFunctionResult, encodeFunctionData, parseUnits } from 'viem'
import { z } from 'zod'

const IR = ${json(ir)} as const
const PIPELINES = ${json(pipelines)} as const
const INCOMING = ${json(incomingMap)} as const
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEFAULT_EXPLORER_TX_BASE_URL = ${json(firstTarget?.chainExplorerTxBaseUrl ?? '')}

type WorkflowContext = {
  triggerPayload: unknown
  outputs: Record<string, unknown>
}

type GeneratedRuntimeConfig = {
  broadcast?: boolean
  chainExplorerTxBaseUrl?: string
  erc20Transfer?: {
    receiverContract?: string | null
  }
}

function deepGet(source: unknown, path: string): unknown {
  const trimmedPath = path.trim()
  const normalized = trimmedPath.startsWith('$.')
    ? trimmedPath.slice(2)
    : trimmedPath.startsWith('$')
      ? trimmedPath.slice(1)
      : trimmedPath
  if (!normalized) return source

  // Split on dots, then further split each segment on bracket notation (e.g. "data[0]" → ["data", "0"])
  const segments: string[] = []
  for (const dotPart of normalized.split('.').map((s) => s.trim()).filter(Boolean)) {
    const bracketMatch = dotPart.match(/^([^\\[]+)((?:\\[\\d+\\])+)$/)
    if (bracketMatch) {
      segments.push(bracketMatch[1])
      for (const idx of bracketMatch[2].matchAll(/\\[(\\d+)\\]/g)) {
        segments.push(idx[1])
      }
    } else {
      segments.push(dotPart)
    }
  }

  let current: unknown = source
  for (const part of segments) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const idx = Number(part)
      current = Number.isInteger(idx) ? current[idx] : undefined
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

function getRuntimeConfig(runtime: Runtime<unknown>): GeneratedRuntimeConfig {
  return (((runtime as unknown as { config?: GeneratedRuntimeConfig }).config ?? {}) as GeneratedRuntimeConfig)
}

function resolveErc20Receiver(node: any, runtime: Runtime<unknown>): string {
  const runtimeConfig = getRuntimeConfig(runtime)
  const runtimeReceiver = runtimeConfig.erc20Transfer?.receiverContract
  return runtimeReceiver && runtimeReceiver.trim() ? runtimeReceiver : node.receiverContract
}

function isBroadcastRuntime(runtime: Runtime<unknown>): boolean {
  return getRuntimeConfig(runtime).broadcast === true
}

function txStatusLabel(status: number): 'SUCCESS' | 'REVERTED' | 'FATAL' | 'UNKNOWN' {
  if (status === 2) return 'SUCCESS'
  if (status === 1) return 'REVERTED'
  if (status === 0) return 'FATAL'
  return 'UNKNOWN'
}

function receiverExecutionStatusLabel(status: unknown): 'SUCCESS' | 'REVERTED' | null {
  if (status === 0) return 'SUCCESS'
  if (status === 1) return 'REVERTED'
  return null
}

function isZeroTxHash(txHash: string): boolean {
  return /^0x0{64}$/i.test(txHash)
}

function readRef(ref: string, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const normalizedRef = ref.trim()

  if (!normalizedRef.startsWith('$')) return normalizedRef

  if (normalizedRef === '$runtime.now') {
    return runtime.now().toISOString()
  }

  if (normalizedRef.startsWith('$trigger')) {
    return deepGet(ctx.triggerPayload, normalizedRef.replace('$trigger', '$'))
  }

  if (normalizedRef.startsWith('$outputs')) {
    const outPath = normalizedRef.replace('$outputs.', '')
    const outputKeys = Object.keys(ctx.outputs).sort((a, b) => b.length - a.length)
    const matchedKey = outputKeys.find((key) => outPath === key || outPath.startsWith(key + '.'))
    if (!matchedKey) return undefined

    const base = ctx.outputs[matchedKey] as unknown
    const tail = outPath === matchedKey ? '$' : '$.' + outPath.slice(matchedKey.length + 1)
    return deepGet(base, tail)
  }

  return normalizedRef
}

function summarizeAmountSource(amountPath: string, ctx: WorkflowContext): string {
  const normalizedPath = amountPath.trim()
  if (!normalizedPath.startsWith('$outputs.')) return ''

  const path = normalizedPath.replace('$outputs.', '')
  const outputKeys = Object.keys(ctx.outputs).sort((a, b) => b.length - a.length)
  const matchedKey = outputKeys.find((key) => path === key || path.startsWith(key + '.'))
  if (!matchedKey) return ''

  const source = ctx.outputs[matchedKey]
  try {
    return JSON.stringify(source, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400)
  } catch {
    return String(source)
  }
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
  return template.replace(/\\{\\{\\s*([^}]+)\\s*\\}\\}/g, (_, raw) => {
    const value = readRef(raw.trim(), runtime, ctx)
    return value === undefined ? '' : String(value)
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += ALPHA[a >> 2]
    out += ALPHA[((a & 3) << 4) | (b ?? 0) >> 4]
    out += b === undefined ? '=' : ALPHA[((b & 15) << 2) | (c ?? 0) >> 6]
    out += c === undefined ? '=' : ALPHA[c & 63]
  }
  return out
}

function runConfidentialHttp(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const confClient = new ConfidentialHTTPClient()
  const encryptOutput = node.encryptOutput !== 'false'

  const fetcher = (sendRequester: ConfidentialHTTPSendRequester) => {
    const vaultSecrets: Array<{ key: string; owner: string }> = [
      { key: node.apiKeySecret, owner: node.owner || '' },
    ]
    if (encryptOutput) {
      vaultSecrets.push({ key: 'san_marino_aes_gcm_encryption_key', owner: node.owner || '' })
    }

    const response = sendRequester
      .sendRequest({
        request: {
          url: node.url,
          method: node.method,
          multiHeaders: {
            'X-Api-Key': { values: [\`{{.\${node.apiKeySecret}}}\`] },
          },
        },
        vaultDonSecrets: vaultSecrets,
        encryptOutput,
      })
      .result()

    if (!ok(response)) {
      throw new Error(\`Confidential HTTP request failed with status: \${response.statusCode}\`)
    }

    if (encryptOutput) {
      const body = response.body ?? new Uint8Array(0)
      const bodyBase64 = bytesToBase64(body)
      const bodyBytes = Array.from(body)
      const nonceHex = bytesToHex(new Uint8Array(bodyBytes.slice(0, 12))).slice(2)
      const ciphertextHex = bytesToHex(new Uint8Array(bodyBytes.slice(12))).slice(2)
      runtime.log('--- CipherTools AES-GCM decrypt (https://www.ciphertools.org/tools/aes/gcm) ---')
      runtime.log('Ciphertext + tag (hex): ' + ciphertextHex)
      runtime.log('Nonce/IV (hex): ' + nonceHex)
      return { bodyBase64 }
    }

    const text = Buffer.from(response.body ?? new Uint8Array(0)).toString('utf8')
    let parsed: unknown = text
    try { parsed = JSON.parse(text) } catch { /* keep as string */ }
    return { statusCode: response.statusCode, body: parsed }
  }

  return confClient
    .sendRequest(runtime, fetcher, consensusIdenticalAggregation<unknown>())(node)
    .result()
}

function runHttpFetch(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const httpClient = new cre.capabilities.HTTPClient()

  const execute = (nodeRuntime: NodeRuntime<unknown>) => {
    const req: {
      method: string
      url: string
      headers: Record<string, string>
      body?: string
    } = {
      method: node.method,
      url: applyTemplate(node.url, runtime, ctx),
      headers: node.headers ?? {},
    }

    if (node.bodyTemplate) {
      const bodyText = applyTemplate(node.bodyTemplate, runtime, ctx)
      req.body = Buffer.from(bodyText, 'utf8').toString('base64')
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

const ERC20_TRANSFER_RECEIVER_ABI = [
  {
    type: 'function',
    name: 'transferToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const ERC20_BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const

function runErc20Transfer(node: any, runtime: Runtime<unknown>, ctx: WorkflowContext): unknown {
  const network =
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: true }) ||
    getNetwork({ chainFamily: 'evm', chainSelectorName: node.chainName, isTestnet: false })

  if (!network) {
    throw new Error('Network not found for ' + node.chainName)
  }

  if (typeof node.tokenAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(node.tokenAddress)) {
    throw new Error('Invalid token address: ' + String(node.tokenAddress))
  }

  if (typeof node.recipientAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(node.recipientAddress)) {
    throw new Error('Invalid recipient address: ' + String(node.recipientAddress))
  }

  const receiverContract = resolveErc20Receiver(node, runtime)
  if (typeof receiverContract !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(receiverContract)) {
    throw new Error('Invalid receiver contract address: ' + String(receiverContract))
  }

  const amountRaw = readRef(node.amountPath, runtime, ctx)
  if (amountRaw === undefined || amountRaw === null) {
    throw new Error(
      'Missing ERC20 transfer amount at path: ' +
        node.amountPath +
        '. Source output preview: ' +
        summarizeAmountSource(node.amountPath, ctx),
    )
  }

  const tokenDecimals = Number(node.tokenDecimals)
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) {
    throw new Error('Invalid token decimals: ' + String(node.tokenDecimals))
  }

  const amountText = String(amountRaw).trim()
  let amountBaseUnits: bigint
  try {
    amountBaseUnits = parseUnits(amountText, tokenDecimals)
  } catch {
    throw new Error('Invalid token amount at path ' + node.amountPath + ': ' + amountText)
  }

  if (amountBaseUnits <= 0n) {
    throw new Error('ERC20 transfer amount must be greater than zero at path ' + node.amountPath)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
  if (isBroadcastRuntime(runtime)) {
    const balanceCallData = encodeFunctionData({
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [receiverContract],
    })

    const balanceRaw = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: ZERO_ADDRESS,
          to: node.tokenAddress,
          data: balanceCallData,
        }),
      })
      .result()

    const receiverBalance = decodeFunctionResult({
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      data: bytesToHex(balanceRaw.data),
    }) as bigint

    runtime.log(
      'Broadcast balance preflight receiver=' +
        receiverContract +
        ' token=' +
        node.tokenAddress +
        ' receiverBalance=' +
        receiverBalance.toString() +
        ' required=' +
        amountBaseUnits.toString(),
    )

    if (receiverBalance < amountBaseUnits) {
      throw new Error(
        'Receiver contract ' +
          receiverContract +
          ' holds ' +
          receiverBalance.toString() +
          ' token base units but requires ' +
          amountBaseUnits.toString() +
          ' for token ' +
          node.tokenAddress,
      )
    }
  } else {
    runtime.log(
      'Dry run mode: ERC20 transfer will not broadcast onchain. Use the Sepolia broadcast target for a real transfer.',
    )
  }

  runtime.log(
    'Preparing ERC20 transfer receiver=' +
      receiverContract +
      ' token=' +
      node.tokenAddress +
      ' recipient=' +
      node.recipientAddress +
      ' tokenDecimals=' +
      String(tokenDecimals) +
      ' amountRaw=' +
      amountText +
      ' amountBaseUnits=' +
      amountBaseUnits.toString(),
  )

  const callData = encodeFunctionData({
    abi: ERC20_TRANSFER_RECEIVER_ABI,
    functionName: 'transferToken',
    args: [node.tokenAddress, node.recipientAddress, amountBaseUnits],
  })

  const report = runtime
    .report({
      encodedPayload: hexToBase64(callData),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  const response = evmClient
    .writeReport(runtime, {
      receiver: receiverContract,
      report,
      gasConfig: {
        gasLimit: String(node.gasLimit),
      },
    })
    .result()

  const txHash = bytesToHex(response.txHash || new Uint8Array(32))
  const runtimeConfig = getRuntimeConfig(runtime)
  const txUrlBase = runtimeConfig.chainExplorerTxBaseUrl || DEFAULT_EXPLORER_TX_BASE_URL
  const txUrl = !isZeroTxHash(txHash) && txUrlBase ? txUrlBase + txHash : undefined
  const statusLabel = txStatusLabel(response.txStatus)
  const receiverStatusLabel = receiverExecutionStatusLabel(response.receiverContractExecutionStatus)

  if (response.txStatus === 2) {
    runtime.log('ERC20 transfer transaction succeeded: ' + txHash)
    if (txUrl) runtime.log('View transaction at ' + txUrl)
  } else if (response.txStatus === 1) {
    throw new Error('ERC20 transfer transaction reverted: ' + (response.errorMessage || 'unknown error'))
  } else if (response.txStatus === 0) {
    throw new Error('ERC20 transfer fatal error: ' + (response.errorMessage || 'unknown error'))
  }

  return {
    txStatus: response.txStatus,
    txStatusLabel: statusLabel,
    txHash,
    txUrl,
    errorMessage: response.errorMessage || '',
    receiverContractExecutionStatus: response.receiverContractExecutionStatus ?? null,
    receiverContractExecutionStatusLabel: receiverStatusLabel,
    receiverContract,
    tokenAddress: node.tokenAddress,
    recipientAddress: node.recipientAddress,
    tokenDecimals,
    amountRaw: amountText,
    amountBaseUnits: amountBaseUnits.toString(),
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
    case 'confidentialHttp':
      return runConfidentialHttp(node, runtime, ctx)
    case 'evmRead':
      return runEvmRead(node, runtime, ctx)
    case 'evmWrite':
      return runEvmWrite(node, runtime, ctx)
    case 'erc20Transfer':
      return runErc20Transfer(node, runtime, ctx)
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

const configSchema = z.object({
  generatedAt: z.string().optional(),
  workflowName: z.string(),
  target: z.string(),
  irVersion: z.string(),
  chainName: z.string().nullable().optional(),
  rpcUrl: z.string().nullable().optional(),
  broadcast: z.boolean().default(false),
  chainExplorerTxBaseUrl: z.string().nullable().optional(),
  evms: z.array(z.object({ chainName: z.string(), url: z.string() })).default([]),
  erc20Transfer: z.object({ receiverContract: z.string().nullable().optional() }).optional(),
})

function initWorkflow(_config: z.infer<typeof configSchema>) {
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
  const runner = await Runner.newRunner({ configSchema })
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
    const secretsPath = ir.secrets ? './secrets.yaml' : ''
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
      postinstall: 'bunx cre-setup',
      'cre-compile': 'cre-compile',
      build: 'bun cre-compile main.ts wasm/workflow.wasm',
      dev: 'tsx main.ts',
      test: 'echo "No tests generated"',
    },
    dependencies: {
      '@chainlink/cre-sdk': '^1.1.2',
      viem: '^2.39.0',
      zod: '^3.24.0',
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
  const targetConfig = ir.runtime.targets[target]
  const firstRpc = targetConfig?.rpcs[0]
  return json({
    generatedAt: new Date('2026-03-08T00:00:00.000Z').toISOString(),
    workflowName: ir.metadata.name,
    target,
    irVersion: ir.irVersion,
    chainName: firstRpc?.chainName ?? null,
    rpcUrl: firstRpc?.url ?? null,
    broadcast: targetConfig?.broadcast ?? false,
    chainExplorerTxBaseUrl: targetConfig?.chainExplorerTxBaseUrl ?? null,
    evms: (targetConfig?.rpcs ?? []).map((rpc) => ({
      chainName: rpc.chainName,
      url: rpc.url,
    })),
    erc20Transfer: {
      receiverContract: targetConfig?.receiverContract ?? null,
    },
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
  const target = ir.runtime.defaultTarget
  const targetConfig = ir.runtime.targets[target]
  const maybeBroadcast = targetConfig?.broadcast ? ' --broadcast' : ''
  const interactiveCommand = `cre workflow simulate . --target ${target}${maybeBroadcast}`

  const nonInteractive: SimulationCommandMetadata[] = []
  for (const [index, trigger] of ir.triggers.entries()) {
    let command = `cre workflow simulate . --non-interactive --trigger-index ${index} --target ${target}${maybeBroadcast}`

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
