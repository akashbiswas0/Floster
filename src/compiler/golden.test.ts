import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileIR } from './index.js'
import { validIRFixture } from '../domain/__fixtures__/valid-ir.js'
import { erc20IRFixture } from '../domain/__fixtures__/payout-ir.js'

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

  it('generates erc20 transfer code path', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'cre-golden-payout-'))
    const result = await compileIR(erc20IRFixture, out)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

    const mainTs = await readFile(path.join(out, 'main.ts'), 'utf8')
    expect(mainTs.includes('const ERC20_TRANSFER_RECEIVER_ABI')).toBe(true)
    expect(mainTs.includes('parseUnits(amountText, tokenDecimals)')).toBe(true)
    expect(mainTs.includes("functionName: 'transferToken'")).toBe(true)
    expect(mainTs.includes("functionName: 'balanceOf'")).toBe(true)
    expect(mainTs.includes('writeReport(runtime, {')).toBe(true)
    expect(mainTs.includes('txStatusLabel')).toBe(true)
    expect(mainTs.includes('$outputs.action_http_1.body.number')).toBe(true)
  })

  it('includes --broadcast in simulation metadata for broadcast targets', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'cre-golden-broadcast-'))
    const ir = structuredClone(erc20IRFixture)
    ir.runtime.defaultTarget = 'sepolia-broadcast'
    ir.runtime.targets['sepolia-broadcast'] = {
      rpcs: [
        {
          chainName: 'ethereum-testnet-sepolia',
          url: 'https://ethereum-sepolia-rpc.publicnode.com',
        },
      ],
      broadcast: true,
      receiverContract: '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
      chainExplorerTxBaseUrl: 'https://sepolia.etherscan.io/tx/',
    }

    const result = await compileIR(ir, out)
    expect(result.simulation.interactiveCommand.includes('--broadcast')).toBe(true)

    const broadcastConfig = JSON.parse(await readFile(path.join(out, 'config.sepolia-broadcast.json'), 'utf8')) as {
      broadcast?: boolean
      erc20Transfer?: { receiverContract?: string | null }
    }
    expect(broadcastConfig.broadcast).toBe(true)
    expect(broadcastConfig.erc20Transfer?.receiverContract).toBe(
      '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
    )
  })
})
