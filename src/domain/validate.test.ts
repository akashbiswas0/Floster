import { describe, expect, it } from 'vitest'
import { validateIR } from './validate.js'
import { runDeterminismLint, runPreflight } from './lint.js'
import { validIRFixture } from './__fixtures__/valid-ir.js'

describe('IR validation + lint + preflight', () => {
  it('accepts a valid fixture', () => {
    const result = validateIR(validIRFixture)
    expect(result.valid).toBe(true)
  })

  it('rejects non-deterministic Date.now usage', () => {
    const ir = structuredClone(validIRFixture)
    const transform = ir.actions.find((action) => action.type === 'transform')
    if (!transform || transform.type !== 'transform') throw new Error('missing transform')

    transform.template.timestamp = 'Date.now()'
    const diagnostics = runDeterminismLint(ir)

    expect(diagnostics.some((d) => d.code === 'DETERMINISM_TIME_SOURCE')).toBe(true)
  })

  it('enforces cron minimum interval quota', () => {
    const ir = structuredClone(validIRFixture)
    const trigger = ir.triggers.find((t) => t.type === 'cron')
    if (!trigger) throw new Error('expected cron trigger')
    trigger.schedule = '*/5 * * * * *'

    const preflight = runPreflight(ir)
    expect(preflight.valid).toBe(false)
    expect(preflight.diagnostics.some((d) => d.code === 'QUOTA_CRON_MIN_INTERVAL')).toBe(true)
  })

  it('enforces llm-driven structured output', () => {
    const ir = structuredClone(validIRFixture)
    const transform = ir.actions.find((action) => action.type === 'transform')
    if (!transform || transform.type !== 'transform') throw new Error('missing transform')

    delete transform.outputSchema
    const diagnostics = runDeterminismLint(ir)

    expect(diagnostics.some((d) => d.code === 'LLM_STRUCTURED_OUTPUT_REQUIRED')).toBe(true)
  })
})
