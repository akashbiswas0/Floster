import path from 'node:path'
import { Router } from 'express'
import { compileIR } from '../compiler/index.js'
import { runDeterminismLint, runPreflight } from '../domain/lint.js'
import { normalizeWorkflowIR } from '../domain/normalize.js'
import { ensureTargetConfig } from '../domain/targets.js'
import { validateIR } from '../domain/validate.js'
import type { WorkflowIR, SimulationRequest } from '../domain/types.js'
import { simulateWorkflow } from '../simulation/index.js'
import { generateIR, repairIR, streamGenerateIR } from '../ai/index.js'

export function buildApiRouter(openRouterApiKey: string): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() })
  })

  router.post('/validate', (req, res) => {
    const normalized = normalizeWorkflowIR(req.body)
    const payload = normalized.ir
    const validation = validateIR(payload)

    if (!validation.valid) {
      return res.status(400).json({
        ...validation,
        diagnostics: [...normalized.diagnostics, ...validation.diagnostics],
      })
    }

    const ir = payload as WorkflowIR
    const lintDiagnostics = runDeterminismLint(ir)
    const preflight = runPreflight(ir)

    return res.json({
      valid: lintDiagnostics.every((d) => d.severity !== 'error') && preflight.valid,
      diagnostics: [...normalized.diagnostics, ...validation.diagnostics, ...lintDiagnostics, ...preflight.diagnostics],
      quotas: preflight.quotas,
      ir,
    })
  })

  router.post('/compile', async (req, res) => {
    const { ir, outputDir } = req.body as {
      ir: WorkflowIR
      outputDir?: string
    }

    const normalized = normalizeWorkflowIR(ir)
    const destination = outputDir ?? path.join(process.cwd(), 'generated', normalized.ir.metadata.name)
    const result = await compileIR(normalized.ir, destination)

    if (result.diagnostics.some((d) => d.severity === 'error')) {
      return res.status(400).json({
        ...result,
        diagnostics: [...normalized.diagnostics, ...result.diagnostics],
      })
    }

    return res.json({
      ...result,
      diagnostics: [...normalized.diagnostics, ...result.diagnostics],
    })
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

      const normalized = normalizeWorkflowIR(payload.ir)
      const compileIRPayload = structuredClone(normalized.ir)
      if (payload.target) {
        compileIRPayload.runtime = ensureTargetConfig(compileIRPayload.runtime, payload.target)
        compileIRPayload.runtime.defaultTarget = payload.target
      }
      const destination = payload.outputDir ?? path.join(process.cwd(), 'generated', normalized.ir.metadata.name)
      compileResult = await compileIR(compileIRPayload, destination)
      if (compileResult.diagnostics.some((d) => d.severity === 'error')) {
        return res.status(400).json({
          compile: {
            ...compileResult,
            diagnostics: [...normalized.diagnostics, ...compileResult.diagnostics],
          },
          diagnostics: [...normalized.diagnostics, ...compileResult.diagnostics],
        })
      }

      compileResult = {
        ...compileResult,
        diagnostics: [...normalized.diagnostics, ...compileResult.diagnostics],
      }

      simulationRequest = {
        workflowPath: destination,
        target: payload.target,
        triggerInput: payload.triggerInput,
        ...(payload.broadcast !== undefined ? { broadcast: payload.broadcast } : {}),
      }
    }

    if (!shouldCompile) {
      simulationRequest = {
        workflowPath: payload.workflowPath,
        target: payload.target,
        triggerInput: payload.triggerInput,
        ...(payload.broadcast !== undefined ? { broadcast: payload.broadcast } : {}),
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

    if (!openRouterApiKey) {
      return res.status(500).json({
        diagnostics: [{
          severity: 'error',
          code: 'OPENROUTER_API_KEY_MISSING',
          message: 'OPENROUTER_API_KEY is not set on the server. Add it to your .env file.',
        }],
      })
    }

    const result = await generateIR(
      context ? { prompt, context } : { prompt },
      openRouterApiKey,
    )
    res.json(result)
  })

  router.post('/ai/generate-stream', async (req, res) => {
    const { prompt, context } = req.body as {
      prompt: string
      context?: { preferredChains?: string[]; targetName?: string }
    }

    if (!prompt?.trim()) {
      return res.status(400).json({
        diagnostics: [{ severity: 'error', code: 'PROMPT_REQUIRED', message: 'prompt is required' }],
      })
    }

    if (!openRouterApiKey) {
      return res.status(500).json({
        diagnostics: [{
          severity: 'error',
          code: 'OPENROUTER_API_KEY_MISSING',
          message: 'OPENROUTER_API_KEY is not set on the server. Add it to your .env file.',
        }],
      })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    try {
      const input = context ? { prompt, context } : { prompt }
      for await (const chunk of streamGenerateIR(input, openRouterApiKey)) {
        res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      res.end()
    }
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
