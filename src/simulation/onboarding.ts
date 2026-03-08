import { access } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Diagnostic } from '../domain/types.js'

async function runCommand(bin: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.on('error', () => {
      resolve({ code: 127, output: '' })
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output })
    })
  })
}

export async function runOnboardingChecks(workflowPath: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []

  const creVersion = await runCommand('cre', ['version'])
  if (creVersion.code !== 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_CRE_MISSING',
      message: 'CRE CLI is not installed or not available on PATH.',
    })
    return diagnostics
  }

  const whoami = await runCommand('cre', ['whoami'])
  if (whoami.code !== 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_CRE_AUTH',
      message: 'CRE CLI is installed but not authenticated. Run `cre login`.',
    })
  }

  const requiredFiles = ['project.yaml', 'workflow.yaml', '.env']
  for (const file of requiredFiles) {
    try {
      await access(path.join(workflowPath, file))
    } catch {
      diagnostics.push({
        severity: 'error',
        code: 'ONBOARDING_MISSING_FILE',
        message: `Missing required file: ${file}`,
      })
    }
  }

  return diagnostics
}
