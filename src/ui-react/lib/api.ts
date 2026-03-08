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

  return `${summary.join('\n')}\n\n${JSON.stringify(response, null, 2)}`
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
