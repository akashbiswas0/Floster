import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Diagnostic } from '../domain/types.js'

type OnboardingOptions = {
  target?: string
  broadcast?: boolean
}

type TargetConfigFile = {
  rpcUrl?: string
  chainName?: string
  broadcast?: boolean
  erc20Transfer?: {
    receiverContract?: string | null
  }
}

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

async function resolveCreBinary(): Promise<string> {
  const direct = await runCommand('cre', ['version'])
  if (direct.code === 0) {
    return 'cre'
  }

  if (process.env.CRE_INSTALL) {
    return path.join(process.env.CRE_INSTALL, 'bin', 'cre')
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.cre', 'bin', 'cre')
  }
  return 'cre'
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
    return /\berc20Transfer\b/.test(source)
  } catch {
    return false
  }
}

function hasEthPrivateKey(content: string): boolean {
  return /(^|\n)\s*CRE_ETH_PRIVATE_KEY\s*=\s*[^\s#]+/.test(content)
}

function extractEthPrivateKey(content: string): string | null {
  const match = content.match(/(^|\n)\s*CRE_ETH_PRIVATE_KEY\s*=\s*([^\s#]+)/)
  return match?.[2] ?? null
}

function sanitizeTargetName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

async function readTargetConfig(workflowPath: string, target: string): Promise<TargetConfigFile | null> {
  const configPath = path.join(workflowPath, `config.${sanitizeTargetName(target)}.json`)
  if (!(await exists(configPath))) return null

  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as TargetConfigFile
  } catch {
    return null
  }
}

function parseWei(value: string): bigint | null {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null
  try {
    return BigInt(normalized)
  } catch {
    return null
  }
}

async function checkBroadcastWallet(
  envContent: string,
  workflowPath: string,
  target: string,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  const privateKey = extractEthPrivateKey(envContent)
  if (!privateKey) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_ENV_KEY_MISSING',
      message: 'Missing CRE_ETH_PRIVATE_KEY in .env. Required for erc20Transfer simulation.',
    })
    return diagnostics
  }

  const targetConfig = await readTargetConfig(workflowPath, target)
  if (!targetConfig?.rpcUrl) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_TARGET_RPC_MISSING',
      message: `Missing rpcUrl in generated config for target '${target}'.`,
    })
    return diagnostics
  }

  const walletAddressResult = await runCommand('cast', ['wallet', 'address', '--private-key', privateKey])
  if (walletAddressResult.code !== 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'ONBOARDING_CAST_WALLET_CHECK_FAILED',
      message: 'Unable to derive wallet address from CRE_ETH_PRIVATE_KEY using cast. Skipping gas balance preflight.',
    })
    return diagnostics
  }

  const walletAddress = walletAddressResult.output.trim()
  const balanceResult = await runCommand('cast', [
    'balance',
    walletAddress,
    '--rpc-url',
    targetConfig.rpcUrl,
  ])
  if (balanceResult.code !== 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'ONBOARDING_CAST_BALANCE_CHECK_FAILED',
      message: `Unable to fetch native gas balance for ${walletAddress}. Skipping broadcast gas preflight.`,
    })
    return diagnostics
  }

  const balanceWei = parseWei(balanceResult.output)
  if (balanceWei === null) {
    diagnostics.push({
      severity: 'warning',
      code: 'ONBOARDING_BALANCE_PARSE_FAILED',
      message: `Could not parse native balance response for ${walletAddress}. Skipping broadcast gas preflight.`,
    })
    return diagnostics
  }

  if (balanceWei <= 0n) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_BROADCAST_GAS_EMPTY',
      message: `Wallet ${walletAddress} has 0 native balance on ${targetConfig.chainName ?? target}; fund it before running broadcast simulation.`,
    })
  }

  return diagnostics
}

export async function runOnboardingChecks(
  workflowPath: string,
  options: OnboardingOptions = {},
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []

  const creBin = await resolveCreBinary()
  const creVersion = await runCommand(creBin, ['version'])
  if (creVersion.code !== 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ONBOARDING_CRE_MISSING',
      message: 'CRE CLI is not installed or not available on PATH.',
    })
    return diagnostics
  }

  const whoami = await runCommand(creBin, ['whoami'])
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
          'This workflow contains erc20Transfer and requires .env with CRE_ETH_PRIVATE_KEY for simulation.',
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
        message: 'Missing CRE_ETH_PRIVATE_KEY in .env. Required for erc20Transfer simulation.',
      })
      return diagnostics
    }

    if (options.broadcast && options.target) {
      diagnostics.push(...(await checkBroadcastWallet(envContent, workflowPath, options.target)))
    }
  }

  return diagnostics
}
