import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileIR } from './index.js'
import { validIRFixture } from '../domain/__fixtures__/valid-ir.js'
import { payoutIRFixture } from '../domain/__fixtures__/payout-ir.js'

describe('compiler golden outputs', () => {
  it('matches workflow.yaml and project.yaml golden files', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'cre-golden-'))
    const result = await compileIR(validIRFixture, out)

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

    const workflowYaml = await readFile(path.join(out, 'workflow.yaml'), 'utf8')
    const projectYaml = await readFile(path.join(out, 'project.yaml'), 'utf8')
    const mainTs = await readFile(path.join(out, 'main.ts'), 'utf8')
    const packageJson = JSON.parse(await readFile(path.join(out, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

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
    expect(mainTs.includes('body: node.bodyTemplate')).toBe(false)
    expect(mainTs.includes('if (node.bodyTemplate)')).toBe(true)
    expect(packageJson.scripts?.postinstall).toBe('bunx cre-setup')
    expect(packageJson.scripts?.['cre-compile']).toBe('cre-compile')
  })

  it('generates payout transfer code path', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'cre-golden-payout-'))
    const result = await compileIR(payoutIRFixture, out)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

    const mainTs = await readFile(path.join(out, 'main.ts'), 'utf8')
    expect(mainTs.includes('parseUnits(amountText, 18)')).toBe(true)
    expect(mainTs.includes("parseAbiParameters('address recipient, uint256 amountWei')")).toBe(true)
    expect(mainTs.includes('writeReport(runtime, {')).toBe(true)
    expect(mainTs.includes('$outputs.action_http_1.body.number')).toBe(true)
  })
})
