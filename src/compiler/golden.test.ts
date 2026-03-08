import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileIR } from './index.js'
import { validIRFixture } from '../domain/__fixtures__/valid-ir.js'

describe('compiler golden outputs', () => {
  it('matches workflow.yaml and project.yaml golden files', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'cre-golden-'))
    const result = await compileIR(validIRFixture, out)

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

    const workflowYaml = await readFile(path.join(out, 'workflow.yaml'), 'utf8')
    const projectYaml = await readFile(path.join(out, 'project.yaml'), 'utf8')

    const expectedWorkflow = await readFile(
      path.join(process.cwd(), 'src', 'compiler', '__fixtures__', 'golden', 'workflow.yaml'),
      'utf8',
    )
    const expectedProject = await readFile(
      path.join(process.cwd(), 'src', 'compiler', '__fixtures__', 'golden', 'project.yaml'),
      'utf8',
    )

    expect(workflowYaml).toBe(expectedWorkflow)
    expect(projectYaml).toBe(expectedProject)
  })
})
