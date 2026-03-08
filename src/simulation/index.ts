import crypto from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function runCommand(bin: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: process.env })
    child.on('error', () => resolve(127))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

function pushDebug(logs: Array<{ level: 'stdout' | 'stderr'; line: string }>, line: string): void {
  logs.push({ level: 'stderr', line: `[debug] ${line}` })
}

async function readTextCommand(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: process.env })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(output.trim()))
  })
}

async function readWorkflowPackageScripts(
  workflowPath: string,
): Promise<Record<string, string> | undefined> {
  const packageJsonPath = path.join(workflowPath, 'package.json')
  if (!(await exists(packageJsonPath))) return undefined

  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> }
    const scripts = parsed.scripts
    return scripts
  } catch {
    return undefined
  }
}

type DependencySetupResult = {
  diagnostics: Diagnostic[]
  debug: string[]
}

async function ensureWorkflowDependencies(
  workflowPath: string,
  logs: Array<{ level: 'stdout' | 'stderr'; line: string }>,
): Promise<DependencySetupResult> {
  const diagnostics: Diagnostic[] = []
  const debug: string[] = []
  const packageJsonPath = path.join(workflowPath, 'package.json')
  if (!(await exists(packageJsonPath))) {
    debug.push('No package.json in workflow directory; skipping TypeScript dependency bootstrap.')
    return { diagnostics, debug }
  }

  debug.push('Detected package.json; evaluating workflow dependency bootstrap.')
  const bunVersionCode = await runCommand('bun', ['--version'], workflowPath)
  if (bunVersionCode !== 0) {
    debug.push('`bun --version` failed; Bun is unavailable.')
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_BUN_MISSING',
      message: 'Bun is required for TypeScript workflows. Install Bun and retry simulation.',
    })
    return { diagnostics, debug }
  }

  const bunVersionText = await readTextCommand('bun', ['--version'], workflowPath)
  if (bunVersionText) debug.push(`bun version: ${bunVersionText}`)

  const creCompilePath = path.join(workflowPath, 'node_modules', '.bin', 'cre-compile')
  const hasCreCompileBefore = await exists(creCompilePath)
  debug.push(`cre-compile exists before install: ${hasCreCompileBefore}`)

  const scripts = await readWorkflowPackageScripts(workflowPath)
  if (scripts) {
    debug.push(`package.json scripts: ${Object.keys(scripts).sort().join(', ') || '(none)'}`)
    if (scripts.postinstall) debug.push(`postinstall script: ${scripts.postinstall}`)
    if (scripts['cre-compile']) debug.push(`cre-compile script: ${scripts['cre-compile']}`)
  } else {
    debug.push('Unable to parse package.json scripts for debug output.')
  }

  if (await exists(creCompilePath)) {
    debug.push('Skipping bun install because cre-compile is already present.')
    return { diagnostics, debug }
  }

  pushDebug(logs, 'Preparing TypeScript workflow dependencies with `bun install`...')
  debug.push('Running `bun install` to bootstrap cre-compile and CRE SDK setup.')

  const installCode = await new Promise<number>((resolve) => {
    const child = spawn('bun', ['install'], {
      cwd: workflowPath,
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

  if (installCode !== 0) {
    debug.push(`bun install exit code: ${installCode}`)
    diagnostics.push({
      severity: 'error',
      code: 'SIMULATION_DEP_INSTALL_FAILED',
      message:
        'Failed to install workflow dependencies with `bun install`. Fix package/dependency errors and retry.',
    })
    return { diagnostics, debug }
  }

  const hasCreCompileAfter = await exists(creCompilePath)
  debug.push(`bun install exit code: 0`)
  debug.push(`cre-compile exists after install: ${hasCreCompileAfter}`)

  if (!hasCreCompileAfter) {
    diagnostics.push({
      severity: 'error',
      code: 'SIMULATION_CRE_COMPILE_MISSING',
      message:
        'Dependency install completed, but `cre-compile` is still unavailable. Ensure @chainlink/cre-sdk is installed and postinstall runs `bunx cre-setup`.',
    })
    return { diagnostics, debug }
  }

  diagnostics.push({
    severity: 'info',
    code: 'SIMULATION_DEP_INSTALL_AUTO',
    message: 'Installed workflow dependencies automatically using `bun install`.',
  })

  return { diagnostics, debug }
}

export async function simulateWorkflow(
  request: SimulationRequest,
): Promise<{ diagnostics: Diagnostic[]; simulation?: SimulationResult }> {
  const logs: Array<{ level: 'stdout' | 'stderr'; line: string }> = []
  pushDebug(
    logs,
    `simulate request: workflowPath=${request.workflowPath}, target=${request.target}, mode=${request.triggerInput.mode}`,
  )

  const fileChecks = await Promise.all([
    exists(path.join(request.workflowPath, 'project.yaml')),
    exists(path.join(request.workflowPath, 'workflow.yaml')),
    exists(path.join(request.workflowPath, '.env')),
    exists(path.join(request.workflowPath, '.env.example')),
    exists(path.join(request.workflowPath, 'package.json')),
    exists(path.join(request.workflowPath, 'node_modules', '.bin', 'cre-compile')),
  ])
  pushDebug(
    logs,
    `workflow files: project.yaml=${fileChecks[0]}, workflow.yaml=${fileChecks[1]}, .env=${fileChecks[2]}, .env.example=${fileChecks[3]}, package.json=${fileChecks[4]}, cre-compile=${fileChecks[5]}`,
  )

  const checks = await runOnboardingChecks(request.workflowPath)
  if (checks.length > 0) {
    for (const diag of checks) {
      pushDebug(logs, `onboarding ${diag.severity} ${diag.code}: ${diag.message}`)
    }
  } else {
    pushDebug(logs, 'onboarding checks passed with no diagnostics.')
  }

  if (checks.some((d) => d.severity === 'error')) {
    return { diagnostics: checks }
  }

  const dependencySetup = await ensureWorkflowDependencies(request.workflowPath, logs)
  for (const line of dependencySetup.debug) {
    pushDebug(logs, line)
  }

  const diagnostics = [...checks, ...dependencySetup.diagnostics]
  if (dependencySetup.diagnostics.some((d) => d.severity === 'error')) {
    return {
      diagnostics,
      simulation: {
        runId: crypto.randomUUID(),
        command: '',
        exitCode: 1,
        logs,
      },
    }
  }

  const args = buildArgs(request)
  const command = `cre ${args.join(' ')}`
  pushDebug(logs, `executing command: ${command}`)

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
  pushDebug(logs, `command exit code: ${exitCode}`)
  if (parsedResult) {
    simulation.result = parsedResult
  }

  return {
    diagnostics,
    simulation,
  }
}
