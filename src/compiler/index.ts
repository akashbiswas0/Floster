import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runDeterminismLint, runPreflight } from '../domain/lint.js'
import { normalizeWorkflowIR } from '../domain/normalize.js'
import { validateIR } from '../domain/validate.js'
import type { CompileResult, Diagnostic, WorkflowIR } from '../domain/types.js'
import { generateArtifacts } from './templates.js'

function workflowRequiresPrivateKey(ir: WorkflowIR): boolean {
  return ir.actions.some((action) => action.type === 'erc20Transfer')
}

function extractEthPrivateKey(envContent: string): string | null {
  const match = envContent.match(/(^|\n)\s*CRE_ETH_PRIVATE_KEY\s*=\s*([^\s#]+)/)
  if (!match || !match[2]) return null
  return match[2]
}

async function maybeProvisionWorkflowEnv(ir: WorkflowIR): Promise<{
  envContent?: string
  diagnostic?: Diagnostic
}> {
  if (!workflowRequiresPrivateKey(ir)) return {}

  const rootEnvPath = path.join(process.cwd(), '.env')
  const envText = await readFile(rootEnvPath, 'utf8').catch(() => '')
  const key = extractEthPrivateKey(envText)
  if (!key) {
    return {
      diagnostic: {
        severity: 'warning',
        code: 'COMPILE_ROOT_ENV_KEY_MISSING',
        message:
          'Workflow contains erc20Transfer but root .env does not include CRE_ETH_PRIVATE_KEY; generated workflow .env was not created.',
      },
    }
  }

  return {
    envContent: `CRE_ETH_PRIVATE_KEY=${key}\n`,
  }
}

export async function compileIR(ir: WorkflowIR, outputDir: string): Promise<CompileResult> {
  const normalized = normalizeWorkflowIR(ir)
  const nextIR = normalized.ir
  const validation = validateIR(nextIR)
  const lintDiagnostics = runDeterminismLint(nextIR)
  const preflight = runPreflight(nextIR)

  const diagnostics = [
    ...normalized.diagnostics,
    ...validation.diagnostics,
    ...lintDiagnostics,
    ...preflight.diagnostics,
  ]

  if (diagnostics.some((d) => d.severity === 'error')) {
    return {
      generatedFiles: [],
      diagnostics,
      simulation: {
        interactiveCommand: '',
        nonInteractive: [],
      },
    }
  }

  const artifacts = generateArtifacts(nextIR)
  const envProvisioning = await maybeProvisionWorkflowEnv(nextIR)
  if (envProvisioning.envContent) {
    artifacts.files['.env'] = envProvisioning.envContent
  }
  if (envProvisioning.diagnostic) {
    diagnostics.push(envProvisioning.diagnostic)
  }

  await mkdir(outputDir, { recursive: true })
  const generatedFiles: string[] = []

  for (const [relativeFile, content] of Object.entries(artifacts.files)) {
    const absoluteFile = path.join(outputDir, relativeFile)
    await mkdir(path.dirname(absoluteFile), { recursive: true })
    await writeFile(absoluteFile, content, 'utf8')
    generatedFiles.push(absoluteFile)
  }

  return {
    generatedFiles,
    diagnostics,
    simulation: artifacts.simulation,
  }
}
