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
import { SYSTEM_PROMPT } from './prompts.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4-5'

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

async function callOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    stream: false,
  }
  console.log('[AI] callOpenRouter →', OPENROUTER_MODEL)

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:4173',
      'X-Title': 'CRE Workflow Builder',
    },
    body: JSON.stringify(requestBody),
  })

  console.log('[AI] callOpenRouter ← status', response.status)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[AI] callOpenRouter error body:', errorBody)
    throw new Error(`OpenRouter error ${response.status}: ${errorBody}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter returned an empty content field')
  console.log('[AI] callOpenRouter received', content.length, 'chars')
  return content
}

function parseIRFromLLMResponse(raw: string): WorkflowIR {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`LLM returned non-JSON response: ${(err as Error).message}`)
  }

  return parsed as WorkflowIR
}


function ensureTransformNodes(ir: WorkflowIR): WorkflowIR {
  const next = structuredClone(ir)

  const hasDownstreamTransform = new Set<string>()
  for (const edge of next.edges) {
    const target = next.actions.find((a) => a.id === edge.to)
    if (target?.type === 'transform') {
      hasDownstreamTransform.add(edge.from)
    }
  }

  let insertCount = 0
  for (const action of [...next.actions]) {
    if (action.type !== 'httpFetch' && action.type !== 'evmRead') continue
    if (hasDownstreamTransform.has(action.id)) continue

    const successorEdges = next.edges.filter((e) => e.from === action.id)

    insertCount += 1
    const transformId = `action_transform_auto_${insertCount}`
    next.actions.push({
      id: transformId,
      name: 'Extract Result',
      type: 'transform',
      template: {
        result: `$outputs.${action.id}.body`,
        timestamp: '$runtime.now',
      },
    })

    if (successorEdges.length === 0) {
      next.edges.push({ from: action.id, to: transformId })
    } else {
      for (const edge of successorEdges) {
        edge.from = transformId
      }
      next.edges.push({ from: action.id, to: transformId })
    }
  }

  return next
}

async function runAutoRepair(ir: WorkflowIR): Promise<{ ir: WorkflowIR; diagnostics: Diagnostic[] }> {
  let current = ensureTransformNodes(structuredClone(ir))
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

export async function generateIR(input: GenerateIRInput, apiKey?: string): Promise<AIResult> {
  const snippets = rankSnippets(input.prompt)

  if (apiKey) {
    const rawJson = await callOpenRouter(input.prompt, apiKey)
    const parsed = parseIRFromLLMResponse(rawJson)
    const repaired = await runAutoRepair(parsed)
    const normalized = normalizeWorkflowIR(repaired.ir)
    return {
      ir: normalized.ir,
      diagnostics: [...normalized.diagnostics, ...repaired.diagnostics],
      snippets,
    }
  }

  const seedIR = buildHeuristicIR(input)
  const repaired = await runAutoRepair(seedIR)
  const normalized = normalizeWorkflowIR(repaired.ir)

  return {
    ir: normalized.ir,
    diagnostics: [...normalized.diagnostics, ...repaired.diagnostics],
    snippets,
  }
}


export async function* streamGenerateIR(
  input: GenerateIRInput,
  apiKey: string,
): AsyncGenerator<string, void, unknown> {
  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input.prompt },
    ],
    stream: true,
  }
  console.log('[AI] streamGenerateIR →', OPENROUTER_MODEL)

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:4173',
      'X-Title': 'CRE Workflow Builder',
    },
    body: JSON.stringify(requestBody),
  })

  console.log('[AI] streamGenerateIR ← status', response.status)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[AI] streamGenerateIR error body:', errorBody)
    throw new Error(`OpenRouter error ${response.status}: ${errorBody}`)
  }

  if (!response.body) {
    throw new Error('OpenRouter returned an empty response body')
  }

  console.log('[AI] streamGenerateIR stream open, reading chunks…')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') {
        console.log('[AI] streamGenerateIR stream complete')
        return
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        
      }
    }
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
