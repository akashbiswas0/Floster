import type { WorkflowIR } from '../types/workflow'

export async function postJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json()
  if (!res.ok) {
    throw new Error(JSON.stringify(payload, null, 2))
  }
  return payload as T
}

export function formatSimulationResponse(
  response: unknown,
  meta: { broadcast: boolean; target: string; receiverContract: string },
): string {
  const r = response as Record<string, unknown>
  const simResult = (r?.simulation as Record<string, unknown> | undefined)?.result as
    | Record<string, unknown>
    | undefined
  const outputs = simResult?.outputs
  const transferOutput = outputs
    ? Object.values(outputs as Record<string, unknown>).find(
        (v) => v && typeof v === 'object' && 'txStatus' in (v as object),
      )
    : null

  const summary = [
    `Mode: ${meta.broadcast ? 'Broadcast to Sepolia' : 'Dry Run'}`,
    `Target: ${meta.target}`,
    `Receiver: ${meta.receiverContract || '(not resolved)'}`,
    `Command: ${(r?.simulation as Record<string, unknown> | undefined)?.command ?? '(not run)'}`,
  ]

  if (transferOutput && typeof transferOutput === 'object') {
    const t = transferOutput as Record<string, unknown>
    if (t.txStatusLabel) summary.push(`Write Status: ${t.txStatusLabel}`)
    if (t.txHash) summary.push(`Tx Hash: ${t.txHash}`)
    if (t.txUrl) summary.push(`Explorer: ${t.txUrl}`)
  }

  if (!meta.broadcast) {
    summary.push('Dry run keeps the onchain write simulated. Choose Broadcast to Sepolia for a real transaction.')
  }

  const sim = r?.simulation as Record<string, unknown> | undefined
  const exitCode = sim?.exitCode as number | undefined
  const allLogs = sim?.logs as Array<{ level: string; line: string }> | undefined
  const filteredLogs = (allLogs ?? [])
    .filter((l) => {
      if (l.line.includes('[USER LOG]')) return true
      if (l.line.includes('[ERROR]') || l.line.includes('Error:') || l.line.includes('error:')) return true
      // On failure, also show non-debug stderr so we can see what went wrong
      if (exitCode !== 0 && l.level === 'stderr' && !l.line.startsWith('[debug]')) return true
      return false
    })
    .map((l) => l.line)

  const logsSection = filteredLogs.length > 0 ? `\nLogs:\n${filteredLogs.join('\n')}` : ''

  const responseWithoutLogs = {
    ...(r as object),
    simulation: r?.simulation
      ? { ...(r.simulation as object), logs: undefined }
      : r?.simulation,
  }

  return `${summary.join('\n')}${logsSection}\n\n${JSON.stringify(responseWithoutLogs, null, 2)}`
}

export function getSimulationMeta(ir: WorkflowIR, target: string) {
  const targetConfig = ir.runtime.targets[target]
  return {
    target,
    broadcast: targetConfig?.broadcast === true,
    receiverContract:
      targetConfig?.receiverContract ||
      ir.actions.find((a) => a.type === 'erc20Transfer')?.receiverContract as string ||
      '',
  }
}
