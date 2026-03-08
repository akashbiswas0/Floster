import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { runOnboardingChecks } from './onboarding.js'
import type { Diagnostic, SimulationRequest, SimulationResult } from '../domain/types.js'

function buildArgs(req: SimulationRequest): string[] {
  const args = ['workflow', 'simulate', req.workflowPath, '--target', req.target]

  if (req.triggerInput.mode === 'interactive') {
    return args
  }

  args.push('--non-interactive', '--trigger-index', String(req.triggerInput.triggerIndex))

  if (req.triggerInput.mode === 'http') {
    const payload =
      typeof req.triggerInput.payload === 'string'
        ? req.triggerInput.payload
        : JSON.stringify(req.triggerInput.payload)

    args.push('--http-payload', payload)
  }

  if (req.triggerInput.mode === 'evmLog') {
    args.push('--evm-tx-hash', req.triggerInput.txHash)
    args.push('--evm-event-index', String(req.triggerInput.eventIndex))
  }

  return args
}

function parseResult(lines: string[]): Record<string, unknown> | undefined {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i]
    if (!candidate) continue
    const line = candidate.trim()
    if (!line.startsWith('{') || !line.endsWith('}')) continue

    try {
      return JSON.parse(line) as Record<string, unknown>
    } catch {
      // Ignore parse errors and continue scanning.
    }
  }

  return undefined
}

export async function simulateWorkflow(
  request: SimulationRequest,
): Promise<{ diagnostics: Diagnostic[]; simulation?: SimulationResult }> {
  const checks = await runOnboardingChecks(request.workflowPath)
  if (checks.some((d) => d.severity === 'error')) {
    return { diagnostics: checks }
  }

  const args = buildArgs(request)
  const logs: Array<{ level: 'stdout' | 'stderr'; line: string }> = []
  const command = `cre ${args.join(' ')}`

  const runId = crypto.randomUUID()

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('cre', args, {
      cwd: request.workflowPath,
      env: process.env,
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        logs.push({ level: 'stdout', line })
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        logs.push({ level: 'stderr', line })
      }
    })

    child.on('error', (error) => {
      logs.push({ level: 'stderr', line: error.message })
      resolve(127)
    })

    child.on('close', (code) => resolve(code ?? 1))
  })

  const stdoutLines = logs.filter((l) => l.level === 'stdout').map((l) => l.line)
  const parsedResult = parseResult(stdoutLines)
  const simulation: SimulationResult = {
    runId,
    command,
    exitCode,
    logs,
  }
  if (parsedResult) {
    simulation.result = parsedResult
  }

  return {
    diagnostics: checks,
    simulation,
  }
}
