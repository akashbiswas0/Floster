import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runDeterminismLint, runPreflight } from '../domain/lint.js'
import { validateIR } from '../domain/validate.js'
import type { CompileResult, WorkflowIR } from '../domain/types.js'
import { generateArtifacts } from './templates.js'

export async function compileIR(ir: WorkflowIR, outputDir: string): Promise<CompileResult> {
  const validation = validateIR(ir)
  const lintDiagnostics = runDeterminismLint(ir)
  const preflight = runPreflight(ir)

  const diagnostics = [
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

  const artifacts = generateArtifacts(ir)

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
