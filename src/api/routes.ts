import path from 'node:path'
import { Router } from 'express'
import { compileIR } from '../compiler/index.js'
import { runDeterminismLint, runPreflight } from '../domain/lint.js'
import { validateIR } from '../domain/validate.js'
import type { WorkflowIR, SimulationRequest } from '../domain/types.js'
import { simulateWorkflow } from '../simulation/index.js'
import { generateIR, repairIR } from '../ai/index.js'

export function buildApiRouter(): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() })
  })

  router.post('/validate', (req, res) => {
    const payload = req.body
    const validation = validateIR(payload)

    if (!validation.valid) {
      return res.status(400).json(validation)
    }

    const ir = payload as WorkflowIR
    const lintDiagnostics = runDeterminismLint(ir)
    const preflight = runPreflight(ir)

    return res.json({
      valid: lintDiagnostics.every((d) => d.severity !== 'error') && preflight.valid,
      diagnostics: [...validation.diagnostics, ...lintDiagnostics, ...preflight.diagnostics],
      quotas: preflight.quotas,
    })
  })

  router.post('/compile', async (req, res) => {
    const { ir, outputDir } = req.body as {
      ir: WorkflowIR
      outputDir?: string
    }

    const destination = outputDir ?? path.join(process.cwd(), 'generated', ir.metadata.name)
    const result = await compileIR(ir, destination)

    if (result.diagnostics.some((d) => d.severity === 'error')) {
      return res.status(400).json(result)
    }

    return res.json(result)
  })

  router.post('/simulate', async (req, res) => {
    const payload = req.body as SimulationRequest & {
      ir?: WorkflowIR
      autoCompile?: boolean
      outputDir?: string
    }

    const shouldCompile = payload.autoCompile === true || Boolean(payload.ir)
    let simulationRequest: SimulationRequest = {
      workflowPath: payload.workflowPath,
      target: payload.target,
      triggerInput: payload.triggerInput,
    }

    let compileResult:
      | {
          generatedFiles: string[]
          diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; code: string; message: string; path?: string }>
          simulation: {
            interactiveCommand: string
            nonInteractive: Array<{
              triggerId: string
              triggerType: 'cron' | 'http' | 'evmLog'
              triggerIndex: number
              command: string
            }>
          }
        }
      | undefined

    if (shouldCompile) {
      if (!payload.ir) {
        return res.status(400).json({
          diagnostics: [
            {
              severity: 'error',
              code: 'SIMULATE_COMPILE_IR_REQUIRED',
              message: 'autoCompile requires an `ir` payload.',
            },
          ],
        })
      }

      const destination = payload.outputDir ?? path.join(process.cwd(), 'generated', payload.ir.metadata.name)
      compileResult = await compileIR(payload.ir, destination)
      if (compileResult.diagnostics.some((d) => d.severity === 'error')) {
        return res.status(400).json({
          compile: compileResult,
          diagnostics: compileResult.diagnostics,
        })
      }

      simulationRequest = {
        workflowPath: destination,
        target: payload.target,
        triggerInput: payload.triggerInput,
      }
    }

    const result = await simulateWorkflow(simulationRequest)

    if (result.diagnostics.some((d) => d.severity === 'error')) {
      return res.status(400).json({
        ...result,
        compile: compileResult,
      })
    }

    return res.json({
      ...result,
      compile: compileResult,
    })
  })

  router.post('/ai/generate', async (req, res) => {
    const { prompt, context } = req.body as {
      prompt: string
      context?: { preferredChains?: string[]; targetName?: string }
    }

    const result = await generateIR(context ? { prompt, context } : { prompt })
    res.json(result)
  })

  router.post('/ai/repair', async (req, res) => {
    const { ir, diagnostics } = req.body as {
      ir: WorkflowIR
      diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; code: string; message: string; path?: string }>
    }

    const result = await repairIR(ir, diagnostics)
    res.json(result)
  })

  return router
}
