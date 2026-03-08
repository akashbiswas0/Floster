import { access, readFile } from 'node:fs/promises'
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function workflowRequiresPrivateKey(workflowPath: string): Promise<boolean> {
  const mainTsPath = path.join(workflowPath, 'main.ts')
  if (!(await exists(mainTsPath))) return false

  try {
    const source = await readFile(mainTsPath, 'utf8')
    return /\bevmPayoutTransfer\b/.test(source)
  } catch {
    return false
  }
}

function hasEthPrivateKey(content: string): boolean {
  return /(^|\n)\s*CRE_ETH_PRIVATE_KEY\s*=\s*[^\s#]+/.test(content)
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

  const requiredFiles = ['project.yaml', 'workflow.yaml']
  for (const file of requiredFiles) {
    if (!(await exists(path.join(workflowPath, file)))) {
      diagnostics.push({
        severity: 'error',
        code: 'ONBOARDING_MISSING_FILE',
        message: `Missing required file: ${file}`,
      })
    }
  }

  const envFile = path.join(workflowPath, '.env')
  const envExampleFile = path.join(workflowPath, '.env.example')
  const hasEnv = await exists(envFile)
  const hasEnvExample = await exists(envExampleFile)
  const requiresPrivateKey = await workflowRequiresPrivateKey(workflowPath)

  if (!hasEnv) {
    if (requiresPrivateKey) {
      diagnostics.push({
        severity: 'error',
        code: 'ONBOARDING_ENV_REQUIRED',
        message:
          'This workflow contains evmPayoutTransfer and requires .env with CRE_ETH_PRIVATE_KEY for simulation.',
      })
      return diagnostics
    }

    diagnostics.push({
      severity: 'warning',
      code: 'ONBOARDING_ENV_MISSING',
      message: hasEnvExample
        ? 'Missing .env file. Found .env.example; copy it to .env before running writes/broadcast simulation.'
        : 'Missing .env file. Create one with CRE_ETH_PRIVATE_KEY (dummy key is fine for non-write simulation).',
    })
  }

  if (requiresPrivateKey && hasEnv) {
    const envContent = await readFile(envFile, 'utf8').catch(() => '')
    if (!hasEthPrivateKey(envContent)) {
      diagnostics.push({
        severity: 'error',
        code: 'ONBOARDING_ENV_KEY_MISSING',
        message: 'Missing CRE_ETH_PRIVATE_KEY in .env. Required for evmPayoutTransfer simulation.',
      })
    }
  }

  return diagnostics
}
