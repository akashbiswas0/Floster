import { computeExecutionOrder } from './graph.js'
import type {
  ActionNode,
  Diagnostic,
  PreflightResult,
  TransformActionNode,
  WorkflowIR,
} from './types.js'

const CRE_QUOTAS = {
  triggerSubscriptionLimit: 10,
  executionTimeoutMinutes: 5,
  cronMinIntervalSeconds: 30,
  httpActionCallLimit: 5,
  evmReadCallLimit: 10,
  evmWriteGasLimit: 5_000_000,
} as const

const DISALLOWED_PATTERNS = [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/]

function lintTransformDeterminism(action: TransformActionNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const [key, value] of Object.entries(action.template)) {
    for (const pattern of DISALLOWED_PATTERNS) {
      if (pattern.test(value)) {
        diagnostics.push({
          severity: 'error',
          code: 'DETERMINISM_TIME_SOURCE',
          message: `Transform '${action.id}' template field '${key}' uses disallowed local time source. Use $runtime.now instead.`,
          path: `/actions/${action.id}/template/${key}`,
        })
      }
    }

    if (value.includes('Promise.race') || value.includes('Promise.any')) {
      diagnostics.push({
        severity: 'error',
        code: 'DETERMINISM_PROMISE_RACE',
        message: `Transform '${action.id}' template field '${key}' uses non-deterministic Promise race semantics.`,
        path: `/actions/${action.id}/template/${key}`,
      })
    }
  }

  if (action.llmDriven && (!action.outputSchema || Object.keys(action.outputSchema).length === 0)) {
    diagnostics.push({
      severity: 'error',
      code: 'LLM_STRUCTURED_OUTPUT_REQUIRED',
      message: `Transform '${action.id}' is llmDriven and requires a non-empty outputSchema.`,
      path: `/actions/${action.id}/outputSchema`,
    })
  }

  return diagnostics
}

function lintResultOrder(ir: WorkflowIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const trigger of ir.triggers) {
    const order = computeExecutionOrder(ir, trigger.id)
    const seen = new Set<string>()

    for (const nodeId of order) {
      if (seen.has(nodeId)) {
        diagnostics.push({
          severity: 'error',
          code: 'ORDER_NON_DETERMINISTIC',
          message: `Pipeline for trigger '${trigger.id}' revisits action '${nodeId}', breaking fixed .result() call order.`,
        })
      }
      seen.add(nodeId)
    }
  }

  return diagnostics
}

function parseCronIntervalSeconds(cronExpr: string): number | null {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 6) return null

  const secPart = parts[0]
  if (!secPart) return null
  if (secPart === '*') return 1
  if (/^\*\/(\d+)$/.test(secPart)) {
    const match = secPart.match(/^\*\/(\d+)$/)
    if (!match || !match[1]) return null
    return Number.parseInt(match[1], 10)
  }
  if (/^\d+$/.test(secPart)) return 60

  return null
}

function countReachableActionsByType(ir: WorkflowIR, actionType: ActionNode['type']): number {
  return ir.actions.filter((action) => action.type === actionType).length
}

export function runDeterminismLint(ir: WorkflowIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const action of ir.actions) {
    if (action.type === 'transform') {
      diagnostics.push(...lintTransformDeterminism(action))
    }
  }

  diagnostics.push(...lintResultOrder(ir))
  return diagnostics
}

export function runPreflight(ir: WorkflowIR): PreflightResult {
  const diagnostics: Diagnostic[] = []

  const triggerCount = ir.triggers.length
  const httpActionCount = countReachableActionsByType(ir, 'httpFetch')
  const evmReadCount = countReachableActionsByType(ir, 'evmRead')
  const evmWriteCount = countReachableActionsByType(ir, 'evmWrite')

  if (triggerCount > CRE_QUOTAS.triggerSubscriptionLimit) {
    diagnostics.push({
      severity: 'error',
      code: 'QUOTA_TRIGGER_LIMIT',
      message: `Trigger count ${triggerCount} exceeds limit ${CRE_QUOTAS.triggerSubscriptionLimit}.`,
    })
  }

  if (httpActionCount > CRE_QUOTAS.httpActionCallLimit) {
    diagnostics.push({
      severity: 'error',
      code: 'QUOTA_HTTP_CALL_LIMIT',
      message: `HTTP action count ${httpActionCount} exceeds limit ${CRE_QUOTAS.httpActionCallLimit}.`,
    })
  }

  if (evmReadCount > CRE_QUOTAS.evmReadCallLimit) {
    diagnostics.push({
      severity: 'error',
      code: 'QUOTA_EVM_READ_LIMIT',
      message: `EVM read count ${evmReadCount} exceeds limit ${CRE_QUOTAS.evmReadCallLimit}.`,
    })
  }

  for (const action of ir.actions) {
    if (action.type === 'evmWrite' && action.gasLimit > CRE_QUOTAS.evmWriteGasLimit) {
      diagnostics.push({
        severity: 'error',
        code: 'QUOTA_EVM_WRITE_GAS_LIMIT',
        message: `Action '${action.id}' gasLimit ${action.gasLimit} exceeds limit ${CRE_QUOTAS.evmWriteGasLimit}.`,
      })
    }
  }

  for (const trigger of ir.triggers) {
    if (trigger.type !== 'cron') continue
    const intervalSeconds = parseCronIntervalSeconds(trigger.schedule)
    if (intervalSeconds === null) {
      diagnostics.push({
        severity: 'warning',
        code: 'CRON_INTERVAL_UNKNOWN',
        message: `Could not infer schedule interval for cron trigger '${trigger.id}'. Ensure it is >= 30 seconds.`,
      })
      continue
    }

    if (intervalSeconds < CRE_QUOTAS.cronMinIntervalSeconds) {
      diagnostics.push({
        severity: 'error',
        code: 'QUOTA_CRON_MIN_INTERVAL',
        message: `Cron trigger '${trigger.id}' interval ${intervalSeconds}s is below minimum ${CRE_QUOTAS.cronMinIntervalSeconds}s.`,
      })
    }
  }

  return {
    valid: diagnostics.every((d) => d.severity !== 'error'),
    diagnostics,
    quotas: {
      triggerCount,
      httpActionCount,
      evmReadCount,
      evmWriteCount,
    },
  }
}
