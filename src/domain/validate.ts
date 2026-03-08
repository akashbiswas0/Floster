import { createRequire } from 'node:module'
import type { ErrorObject } from 'ajv'
import { normalizeLegacyIR } from './normalize.js'
import { workflowIRSchema } from './schema.js'
import { validateGraphTopology } from './graph.js'
import type { Diagnostic, ValidationResult, WorkflowIR } from './types.js'

const require = createRequire(import.meta.url)
const AjvCtor = require('ajv')
const addFormats = require('ajv-formats')

const ajv = new AjvCtor({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(workflowIRSchema)

function fromAjvErrors(): Diagnostic[] {
  return (validate.errors ?? []).map((err: ErrorObject) => ({
    severity: 'error',
    code: 'IR_SCHEMA',
    message: `${err.instancePath || '/'} ${err.message ?? 'schema validation error'}`,
    path: err.instancePath || '/',
  }))
}

function validateUniqueNodeIds(ir: WorkflowIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seen = new Set<string>()
  for (const node of [...ir.triggers, ...ir.actions]) {
    if (seen.has(node.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'IR_DUPLICATE_NODE_ID',
        message: `Duplicate node id detected: '${node.id}'.`,
        path: `/nodes/${node.id}`,
      })
    }
    seen.add(node.id)
  }
  return diagnostics
}

export function validateIR(input: unknown): ValidationResult {
  const normalized = normalizeLegacyIR(input)
  const diagnostics: Diagnostic[] = [...normalized.diagnostics]

  const schemaOk = validate(normalized.ir)
  if (!schemaOk) {
    diagnostics.push(...fromAjvErrors())
    return { valid: false, diagnostics }
  }

  const ir = normalized.ir as WorkflowIR
  diagnostics.push(...validateUniqueNodeIds(ir))
  diagnostics.push(...validateGraphTopology(ir))

  if (!ir.runtime.targets[ir.runtime.defaultTarget]) {
    diagnostics.push({
      severity: 'error',
      code: 'IR_DEFAULT_TARGET_MISSING',
      message: `Default target '${ir.runtime.defaultTarget}' does not exist in runtime.targets.`,
      path: '/runtime/defaultTarget',
    })
  }

  return {
    valid: diagnostics.every((d) => d.severity !== 'error'),
    diagnostics,
  }
}
