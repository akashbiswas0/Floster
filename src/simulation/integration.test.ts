import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { simulateWorkflow } from './index.js'

async function setupFakeCre() {
  const root = await mkdtemp(path.join(tmpdir(), 'fake-cre-'))
  const binDir = path.join(root, 'bin')
  const workflowDir = path.join(root, 'wf')
  await mkdir(binDir, { recursive: true })
  await mkdir(workflowDir, { recursive: true })

  await writeFile(path.join(workflowDir, 'project.yaml'), 'local-simulation:\n  rpcs: []\n', 'utf8')
  await writeFile(path.join(workflowDir, 'workflow.yaml'), 'local-simulation:\n  user-workflow:\n    workflow-name: test\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.local-simulation.json"\n    secrets-path: ""\n', 'utf8')
  await writeFile(path.join(workflowDir, '.env'), 'CRE_ETH_PRIVATE_KEY=dummy\n', 'utf8')

  const script = `#!/usr/bin/env bash
set -e
if [ "$1" = "version" ]; then
  echo "1.2.0"
  exit 0
fi
if [ "$1" = "whoami" ]; then
  echo "tester@example.com"
  exit 0
fi
if [ "$1" = "workflow" ] && [ "$2" = "simulate" ]; then
  echo "simulate called"
  echo '{"ok":true,"result":"simulated"}'
  exit 0
fi
exit 1
`

  const crePath = path.join(binDir, 'cre')
  await writeFile(crePath, script, 'utf8')
  await chmod(crePath, 0o755)

  return { root, binDir, workflowDir }
}

describe('simulation integration', () => {
  it('runs simulate command and parses result', async () => {
    const setup = await setupFakeCre()

    const prevPath = process.env.PATH
    process.env.PATH = `${setup.binDir}:${prevPath}`

    const result = await simulateWorkflow({
      workflowPath: setup.workflowDir,
      target: 'local-simulation',
      triggerInput: { mode: 'http', triggerIndex: 0, payload: { ping: true } },
    })

    process.env.PATH = prevPath

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
    expect(result.simulation?.exitCode).toBe(0)
    expect(result.simulation?.result).toEqual({ ok: true, result: 'simulated' })
    expect(result.simulation?.command.includes('--http-payload')).toBe(true)
  })

  it('auto-installs TypeScript dependencies when cre-compile is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fake-cre-ts-'))
    const binDir = path.join(root, 'bin')
    const workflowDir = path.join(root, 'wf')
    await mkdir(binDir, { recursive: true })
    await mkdir(workflowDir, { recursive: true })

    await writeFile(path.join(workflowDir, 'project.yaml'), 'local-simulation:\n  rpcs: []\n', 'utf8')
    await writeFile(path.join(workflowDir, 'workflow.yaml'), 'local-simulation:\n  user-workflow:\n    workflow-name: test\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.local-simulation.json"\n    secrets-path: ""\n', 'utf8')
    await writeFile(path.join(workflowDir, '.env'), 'CRE_ETH_PRIVATE_KEY=dummy\n', 'utf8')
    await writeFile(
      path.join(workflowDir, 'package.json'),
      JSON.stringify({ name: 'wf', private: true, scripts: { postinstall: 'bunx cre-setup' } }, null, 2),
      'utf8',
    )

    const creScript = `#!/usr/bin/env bash
set -e
if [ "$1" = "version" ]; then
  echo "1.2.0"
  exit 0
fi
if [ "$1" = "whoami" ]; then
  echo "tester@example.com"
  exit 0
fi
if [ "$1" = "workflow" ] && [ "$2" = "simulate" ]; then
  echo '{"ok":true,"result":"simulated"}'
  exit 0
fi
exit 1
`

    const bunScript = `#!/usr/bin/env bash
set -e
if [ "$1" = "--version" ]; then
  echo "1.2.23"
  exit 0
fi
if [ "$1" = "install" ]; then
  mkdir -p "$PWD/node_modules/.bin"
  cat > "$PWD/node_modules/.bin/cre-compile" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS
  chmod +x "$PWD/node_modules/.bin/cre-compile"
  echo "dependencies installed"
  exit 0
fi
exit 1
`

    const crePath = path.join(binDir, 'cre')
    const bunPath = path.join(binDir, 'bun')
    await writeFile(crePath, creScript, 'utf8')
    await writeFile(bunPath, bunScript, 'utf8')
    await chmod(crePath, 0o755)
    await chmod(bunPath, 0o755)

    const prevPath = process.env.PATH
    process.env.PATH = `${binDir}:${prevPath}`

    const result = await simulateWorkflow({
      workflowPath: workflowDir,
      target: 'local-simulation',
      triggerInput: { mode: 'interactive' },
    })

    process.env.PATH = prevPath

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
    expect(result.diagnostics.some((d) => d.code === 'SIMULATION_DEP_INSTALL_AUTO')).toBe(true)
    expect(result.simulation?.exitCode).toBe(0)
    expect(result.simulation?.result).toEqual({ ok: true, result: 'simulated' })
  })

  it('requires .env with CRE_ETH_PRIVATE_KEY for erc20Transfer workflows', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fake-cre-payout-'))
    const binDir = path.join(root, 'bin')
    const workflowDir = path.join(root, 'wf')
    await mkdir(binDir, { recursive: true })
    await mkdir(workflowDir, { recursive: true })

    await writeFile(path.join(workflowDir, 'project.yaml'), 'local-simulation:\n  rpcs: []\n', 'utf8')
    await writeFile(path.join(workflowDir, 'workflow.yaml'), 'local-simulation:\n  user-workflow:\n    workflow-name: test\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.local-simulation.json"\n    secrets-path: ""\n', 'utf8')
    await writeFile(
      path.join(workflowDir, 'main.ts'),
      'const IR = { actions: [{ type: "erc20Transfer" }] };\n',
      'utf8',
    )

    const script = `#!/usr/bin/env bash
set -e
if [ "$1" = "version" ]; then
  echo "1.2.0"
  exit 0
fi
if [ "$1" = "whoami" ]; then
  echo "tester@example.com"
  exit 0
fi
if [ "$1" = "workflow" ] && [ "$2" = "simulate" ]; then
  echo '{"ok":true,"result":"simulated"}'
  exit 0
fi
exit 1
`
    const crePath = path.join(binDir, 'cre')
    await writeFile(crePath, script, 'utf8')
    await chmod(crePath, 0o755)

    const prevPath = process.env.PATH
    process.env.PATH = `${binDir}:${prevPath}`

    const result = await simulateWorkflow({
      workflowPath: workflowDir,
      target: 'local-simulation',
      triggerInput: { mode: 'interactive' },
    })

    process.env.PATH = prevPath

    expect(result.diagnostics.some((d) => d.code === 'ONBOARDING_ENV_REQUIRED')).toBe(true)
    expect(result.simulation).toBeUndefined()
  })

  it('passes --broadcast and runs broadcast onboarding checks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fake-cre-broadcast-'))
    const binDir = path.join(root, 'bin')
    const workflowDir = path.join(root, 'wf')
    await mkdir(binDir, { recursive: true })
    await mkdir(workflowDir, { recursive: true })

    await writeFile(path.join(workflowDir, 'project.yaml'), 'sepolia-broadcast:\n  rpcs: []\n', 'utf8')
    await writeFile(
      path.join(workflowDir, 'workflow.yaml'),
      'sepolia-broadcast:\n  user-workflow:\n    workflow-name: test\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.sepolia-broadcast.json"\n    secrets-path: ""\n',
      'utf8',
    )
    await writeFile(path.join(workflowDir, '.env'), 'CRE_ETH_PRIVATE_KEY=dummy\n', 'utf8')
    await writeFile(path.join(workflowDir, 'main.ts'), 'const IR = { actions: [{ type: "erc20Transfer" }] };\n', 'utf8')
    await writeFile(
      path.join(workflowDir, 'config.sepolia-broadcast.json'),
      JSON.stringify({
        rpcUrl: 'https://example-rpc.invalid',
        chainName: 'ethereum-testnet-sepolia',
        broadcast: true,
        erc20Transfer: { receiverContract: '0x1234567890123456789012345678901234567890' },
      }),
      'utf8',
    )

    const creScript = `#!/usr/bin/env bash
set -e
if [ "$1" = "version" ]; then
  echo "1.2.0"
  exit 0
fi
if [ "$1" = "whoami" ]; then
  echo "tester@example.com"
  exit 0
fi
if [ "$1" = "workflow" ] && [ "$2" = "simulate" ]; then
  printf '%s\n' "$@"
  echo '{"ok":true,"result":"broadcasted"}'
  exit 0
fi
exit 1
`

    const castScript = `#!/usr/bin/env bash
set -e
if [ "$1" = "wallet" ] && [ "$2" = "address" ]; then
  echo "0x1111111111111111111111111111111111111111"
  exit 0
fi
if [ "$1" = "balance" ]; then
  echo "1000000000000000000"
  exit 0
fi
exit 1
`

    const crePath = path.join(binDir, 'cre')
    const castPath = path.join(binDir, 'cast')
    await writeFile(crePath, creScript, 'utf8')
    await writeFile(castPath, castScript, 'utf8')
    await chmod(crePath, 0o755)
    await chmod(castPath, 0o755)

    const prevPath = process.env.PATH
    process.env.PATH = `${binDir}:${prevPath}`

    const result = await simulateWorkflow({
      workflowPath: workflowDir,
      target: 'sepolia-broadcast',
      broadcast: true,
      triggerInput: { mode: 'interactive' },
    })

    process.env.PATH = prevPath

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
    expect(result.simulation?.command.includes('--broadcast')).toBe(true)
  })
})
