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

function normalizeLegacyAction(action: Record<string, unknown>, diagnostics: Diagnostic[]): void {
  if (action.type === 'erc20Transfer') {
    applyErc20Defaults(action)
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
