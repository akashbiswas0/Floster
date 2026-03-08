import { compileIR } from '../compiler/index.js'
import { runDeterminismLint, runPreflight } from '../domain/lint.js'
import { normalizeWorkflowIR } from '../domain/normalize.js'
import {
  buildDefaultRuntime,
  SEPOLIA_CHAIN_NAME,
  SEPOLIA_SIMULATION_RECEIVER,
  ZERO_ADDRESS,
} from '../domain/targets.js'
import { validateIR } from '../domain/validate.js'
import type { Diagnostic, WorkflowIR } from '../domain/types.js'
import { CRE_TEMPLATE_SNIPPETS, type TemplateSnippet } from './template-snippets.js'

export interface GenerateIRInput {
  prompt: string
  context?: {
    preferredChains?: string[]
    targetName?: string
  }
}

export interface AIResult {
  ir: WorkflowIR
  diagnostics: Diagnostic[]
  snippets: TemplateSnippet[]
}

function rankSnippets(prompt: string): TemplateSnippet[] {
  const query = prompt.toLowerCase()

  const scored = CRE_TEMPLATE_SNIPPETS.map((snippet) => {
    let score = 0

    for (const tag of snippet.tags) {
      if (query.includes(tag.toLowerCase())) score += 2
    }

    if (query.includes('webhook') && snippet.pattern.trigger === 'http') score += 3
    if (query.includes('cron') && snippet.pattern.trigger === 'cron') score += 3
    if (query.includes('log') && snippet.pattern.trigger === 'evmLog') score += 3

    return { snippet, score }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.snippet)
}

function detectIntent(prompt: string): 'cron' | 'http' | 'evmLog' {
  const text = prompt.toLowerCase()
  if (text.includes('webhook') || text.includes('http trigger')) return 'http'
  if (text.includes('log trigger') || text.includes('event')) return 'evmLog'
  return 'cron'
}

function defaultRuntime(targetName?: string, preferredChain?: string): WorkflowIR['runtime'] {
  const target = targetName ?? 'local-simulation'
  const chain = preferredChain ?? SEPOLIA_CHAIN_NAME
  const runtime = buildDefaultRuntime(target)

  for (const cfg of Object.values(runtime.targets)) {
    cfg.rpcs = [{ chainName: chain, url: cfg.rpcs[0]?.url ?? 'https://ethereum-sepolia-rpc.publicnode.com' }]
  }

  return runtime
}

function buildHeuristicIR(input: GenerateIRInput): WorkflowIR {
  const prompt = input.prompt
  const triggerType = detectIntent(prompt)
  const preferredChain = input.context?.preferredChains?.[0]

  const triggerId = 'trigger_1'
  const fetchId = 'action_http_1'
  const transformId = 'action_transform_1'

  const commonActions: WorkflowIR['actions'] = [
    {
      id: fetchId,
      name: 'Fetch Data',
      type: 'httpFetch',
      method: 'GET',
      url: prompt.toLowerCase().includes('graph')
        ? 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'
        : 'https://api.coingecko.com/api/v3/ping',
      consensus: 'identical',
    },
    {
      id: transformId,
      name: 'Normalize Output',
      type: 'transform',
      template: {
        sourcePrompt: prompt,
        timestamp: '$runtime.now',
        data: '$outputs.action_http_1.body',
      },
      llmDriven: true,
      outputSchema: {
        sourcePrompt: 'string',
        timestamp: 'string',
        data: 'object',
      },
    },
  ]

  const ir: WorkflowIR = {
    irVersion: '1.0',
    metadata: {
      name: 'ai-generated-workflow',
      description: `Generated from prompt: ${prompt}`,
    },
    runtime: defaultRuntime(input.context?.targetName, preferredChain),
    triggers: [],
    actions: commonActions,
    edges: [
      { from: triggerId, to: fetchId },
      { from: fetchId, to: transformId },
    ],
  }

  if (triggerType === 'cron') {
    ir.triggers.push({
      id: triggerId,
      name: 'Cron Trigger',
      type: 'cron',
      schedule: '0 */5 * * * *',
    })
  }

  if (triggerType === 'http') {
    ir.triggers.push({
      id: triggerId,
      name: 'HTTP Trigger',
      type: 'http',
      authMode: 'none',
    })
  }

  if (triggerType === 'evmLog') {
    ir.triggers.push({
      id: triggerId,
      name: 'EVM Log Trigger',
      type: 'evmLog',
      chainName: preferredChain ?? 'ethereum-testnet-sepolia',
      addresses: ['0x0000000000000000000000000000000000000001'],
    })
  }

  if (prompt.toLowerCase().includes('write onchain') || prompt.toLowerCase().includes('chain write')) {
    ir.actions.push({
      id: 'action_write_1',
      name: 'Write Report',
      type: 'evmWrite',
      chainName: preferredChain ?? 'ethereum-testnet-sepolia',
      receiver: '0x0000000000000000000000000000000000000002',
      payloadPath: '$outputs.action_transform_1',
      gasLimit: 300000,
    })

    ir.edges.push({ from: transformId, to: 'action_write_1' })
  }

  if (prompt.toLowerCase().includes('erc20') || prompt.toLowerCase().includes('token transfer')) {
    ir.actions.push({
      id: 'action_transfer_1',
      name: 'ERC20 Transfer',
      type: 'erc20Transfer',
      chainName: preferredChain ?? SEPOLIA_CHAIN_NAME,
      tokenAddress: ZERO_ADDRESS,
      receiverContract: SEPOLIA_SIMULATION_RECEIVER,
      recipientAddress: '0x0000000000000000000000000000000000000003',
      tokenDecimals: 18,
      amountPath: '$outputs.action_http_1.body.number',
      gasLimit: 500000,
    })

    ir.edges.push({ from: fetchId, to: 'action_transfer_1' })
  }

  return ir
}

function fixKnownIssues(ir: WorkflowIR, diagnostics: Diagnostic[]): WorkflowIR {
  const next = structuredClone(ir)

  for (const d of diagnostics) {
    if (d.code === 'LLM_STRUCTURED_OUTPUT_REQUIRED') {
      for (const action of next.actions) {
        if (action.type === 'transform' && action.llmDriven && !action.outputSchema) {
          action.outputSchema = { result: 'object' }
        }
      }
    }

    if (d.code === 'QUOTA_CRON_MIN_INTERVAL') {
      for (const trigger of next.triggers) {
        if (trigger.type === 'cron') {
          trigger.schedule = '0 */1 * * * *'
        }
      }
    }

    if (d.code === 'DETERMINISM_TIME_SOURCE') {
      for (const action of next.actions) {
        if (action.type !== 'transform') continue
        for (const [k, v] of Object.entries(action.template)) {
          action.template[k] = v.replace(/Date\.now\(\)/g, '$runtime.now').replace(/new Date\(\)/g, '$runtime.now')
        }
      }
    }
  }

  return next
}

async function runAutoRepair(ir: WorkflowIR): Promise<{ ir: WorkflowIR; diagnostics: Diagnostic[] }> {
  let current = structuredClone(ir)
  let diagnostics: Diagnostic[] = []

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const validated = validateIR(current)
    const linted = runDeterminismLint(current)
    const preflight = runPreflight(current)
    diagnostics = [...validated.diagnostics, ...linted, ...preflight.diagnostics]

    if (diagnostics.every((d) => d.severity !== 'error')) {
      break
    }

    current = fixKnownIssues(current, diagnostics)
  }

  const compileProbe = await compileIR(current, '/tmp/cre-local-builder-probe')
  diagnostics = [...diagnostics, ...compileProbe.diagnostics]

  return { ir: current, diagnostics }
}

export async function generateIR(input: GenerateIRInput): Promise<AIResult> {
  const snippets = rankSnippets(input.prompt)
  const seedIR = buildHeuristicIR(input)
  const repaired = await runAutoRepair(seedIR)
  const normalized = normalizeWorkflowIR(repaired.ir)

  return {
    ir: normalized.ir,
    diagnostics: [...normalized.diagnostics, ...repaired.diagnostics],
    snippets,
  }
}

export async function repairIR(
  ir: WorkflowIR,
  incomingDiagnostics: Diagnostic[],
): Promise<AIResult> {
  const initial = normalizeWorkflowIR(ir)
  const fixed = fixKnownIssues(initial.ir, incomingDiagnostics)
  const repaired = await runAutoRepair(fixed)
  const normalized = normalizeWorkflowIR(repaired.ir)

  return {
    ir: normalized.ir,
    diagnostics: [...initial.diagnostics, ...normalized.diagnostics, ...repaired.diagnostics],
    snippets: [],
  }
}
