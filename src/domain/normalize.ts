import type { Diagnostic, WorkflowIR } from './types.js'
import { SEPOLIA_SIMULATION_RECEIVER, ZERO_ADDRESS } from './targets.js'

function applyErc20Defaults(action: Record<string, unknown>): void {
  if (typeof action.tokenAddress !== 'string') {
    action.tokenAddress = ZERO_ADDRESS
  }
  if (typeof action.receiverContract !== 'string') {
    action.receiverContract = SEPOLIA_SIMULATION_RECEIVER
  }
  if (!Number.isInteger(action.tokenDecimals)) {
    action.tokenDecimals = 18
  }
}

function isValidSecretName(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(value)
}

function normalizeConfidentialHttp(action: Record<string, unknown>, diagnostics: Diagnostic[]): void {
  const raw = typeof action.apiKeySecret === 'string' ? action.apiKeySecret : ''
  if (raw && !isValidSecretName(raw)) {
    action.apiKeySecret = 'myApiKey'
    diagnostics.push({
      severity: 'warning',
      code: 'IR_CONFIDENTIAL_HTTP_SECRET_NAME_FIXED',
      message:
        'The "API Key Secret" field contained what looks like an actual key value instead of a secret name. It has been reset to "myApiKey". Set the real key in your .env as MY_API_KEY_ALL.',
    })
  }

  diagnostics.push({
    severity: 'info',
    code: 'IR_CONFIDENTIAL_HTTP',
    message:
      'Confidential HTTP node compiles to ConfidentialHTTPClient. Secret injection and response encryption are active in both simulation and deployed workflows.',
  })
}

function normalizeLegacyAction(action: Record<string, unknown>, diagnostics: Diagnostic[]): void {
  if (action.type === 'erc20Transfer') {
    applyErc20Defaults(action)
    return
  }

  if (action.type === 'confidentialHttp') {
    normalizeConfidentialHttp(action, diagnostics)
    return
  }

  if (action.type !== 'evmPayoutTransfer') return

  action.type = 'erc20Transfer'
  if (typeof action.name === 'string' && action.name.toLowerCase().includes('payout')) {
    action.name = 'ERC20 Transfer'
  }
  applyErc20Defaults(action)

  diagnostics.push({
    severity: 'warning',
    code: 'IR_LEGACY_PAYOUT_NORMALIZED',
    message:
      'Normalized legacy evmPayoutTransfer to erc20Transfer. tokenAddress defaulted to 0x0000000000000000000000000000000000000000 and should be updated before simulation.',
  })
}

function toEnvVarName(secretKey: string): string {
  return secretKey
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase() + '_ALL'
}

function injectConfidentialSecrets(ir: Record<string, unknown>): void {
  const actions = ir.actions
  if (!Array.isArray(actions)) return

  const secretsToInject: Record<string, string[]> = {}

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue
    const a = action as Record<string, unknown>
    if (a.type !== 'confidentialHttp') continue

    const key = typeof a.apiKeySecret === 'string' ? a.apiKeySecret : 'myApiKey'
    secretsToInject[key] = [toEnvVarName(key)]

    if (a.encryptOutput === 'true') {
      const aesKey = 'san_marino_aes_gcm_encryption_key'
      secretsToInject[aesKey] = ['AES_KEY_ALL']
    }
  }

  if (Object.keys(secretsToInject).length === 0) return

  const existing = ir.secrets as Record<string, unknown> | undefined
  const existingNames =
    existing && typeof existing === 'object' && typeof (existing as Record<string, unknown>).secretsNames === 'object'
      ? ((existing as Record<string, unknown>).secretsNames as Record<string, string[]>)
      : {}

  ir.secrets = { secretsNames: { ...secretsToInject, ...existingNames } }
}

export function normalizeLegacyIR(input: unknown): { ir: unknown; diagnostics: Diagnostic[] } {
  if (!input || typeof input !== 'object') {
    return { ir: input, diagnostics: [] }
  }

  const ir = structuredClone(input as Record<string, unknown>)
  const diagnostics: Diagnostic[] = []

  const actions = ir.actions
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (!action || typeof action !== 'object') continue
      normalizeLegacyAction(action as Record<string, unknown>, diagnostics)
    }
  }

  injectConfidentialSecrets(ir)

  // Strip UI-only edge properties (fromSide, toSide) that are not part of the IR schema
  const edges = ir.edges
  if (Array.isArray(edges)) {
    ir.edges = edges.map((edge: unknown) => {
      if (!edge || typeof edge !== 'object') return edge
      const { from, to } = edge as Record<string, unknown>
      return { from, to }
    })
  }

  return { ir, diagnostics }
}

export function normalizeWorkflowIR(input: WorkflowIR | unknown): {
  ir: WorkflowIR
  diagnostics: Diagnostic[]
} {
  const normalized = normalizeLegacyIR(input)
  return {
    ir: normalized.ir as WorkflowIR,
    diagnostics: normalized.diagnostics,
  }
}
