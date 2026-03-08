import type { WorkflowNode, WorkflowIR } from '../types/workflow'
import {
  SEPOLIA_CHAIN_NAME,
  SEPOLIA_SIMULATION_RECEIVER,
  DEFAULT_TOKEN_ADDRESS,
  DEFAULT_TOKEN_DECIMALS,
  DEFAULT_RECIPIENT_ADDRESS,
  TRIGGER_TYPES,
} from './constants'

export function isTriggerType(type: string): boolean {
  return (TRIGGER_TYPES as readonly string[]).includes(type)
}

export function allNodes(ir: WorkflowIR): WorkflowNode[] {
  return [...ir.triggers, ...ir.actions]
}

export interface EditableField {
  key: string
  label: string
  input: 'text' | 'number' | 'select'
  options?: string[]
}

export function editableFieldsForNode(node: WorkflowNode): EditableField[] {
  if (node.type === 'cron') {
    return [{ key: 'schedule', label: 'Schedule', input: 'text' }]
  }
  if (node.type === 'httpFetch') {
    return [
      { key: 'url', label: 'URL', input: 'text' },
      { key: 'method', label: 'Method', input: 'select', options: ['GET', 'POST'] },
      { key: 'consensus', label: 'Consensus', input: 'select', options: ['identical', 'median'] },
    ]
  }
  if (node.type === 'erc20Transfer') {
    return [
      { key: 'tokenAddress', label: 'Token Address', input: 'text' },
      { key: 'recipientAddress', label: 'Recipient Address', input: 'text' },
      { key: 'tokenDecimals', label: 'Token Decimals', input: 'number' },
      { key: 'chainName', label: 'Chain Name', input: 'text' },
      { key: 'gasLimit', label: 'Gas Limit', input: 'number' },
      { key: 'amountPath', label: 'Amount Path', input: 'text' },
    ]
  }
  if (node.type === 'evmWrite') {
    return [
      { key: 'receiver', label: 'Receiver', input: 'text' },
      { key: 'chainName', label: 'Chain Name', input: 'text' },
      { key: 'gasLimit', label: 'Gas Limit', input: 'number' },
      { key: 'payloadPath', label: 'Payload Path', input: 'text' },
    ]
  }
  if (node.type === 'evmRead') {
    return [
      { key: 'contractAddress', label: 'Contract Address', input: 'text' },
      { key: 'functionName', label: 'Function', input: 'text' },
      { key: 'chainName', label: 'Chain Name', input: 'text' },
    ]
  }
  return []
}

export function makeNode(
  type: string,
  existingCount: number,
  receiverContract: string,
): WorkflowNode {
  const idx = existingCount + 1
  const id = `${isTriggerType(type) ? 'trigger' : 'action'}_${idx}`

  if (type === 'cron') {
    return { id, name: 'Cron Trigger', type: 'cron', schedule: '0 */10 * * * *' }
  }
  if (type === 'http') {
    return { id, name: 'HTTP Trigger', type: 'http', authMode: 'none' }
  }
  if (type === 'evmLog') {
    return {
      id,
      name: 'EVM Log Trigger',
      type: 'evmLog',
      chainName: SEPOLIA_CHAIN_NAME,
      addresses: ['0x0000000000000000000000000000000000000001'],
    }
  }
  if (type === 'httpFetch') {
    return {
      id,
      name: 'HTTP Fetch',
      type: 'httpFetch',
      method: 'GET',
      url: 'https://api.coingecko.com/api/v3/ping',
      consensus: 'identical',
    }
  }
  if (type === 'evmRead') {
    return {
      id,
      name: 'EVM Read',
      type: 'evmRead',
      chainName: SEPOLIA_CHAIN_NAME,
      contractAddress: '0x0000000000000000000000000000000000000001',
      functionName: 'totalSupply',
      inputs: [],
      outputs: [{ name: 'supply', type: 'uint256' }],
      args: [],
      consensus: 'identical',
    }
  }
  if (type === 'evmWrite') {
    return {
      id,
      name: 'EVM Write',
      type: 'evmWrite',
      chainName: SEPOLIA_CHAIN_NAME,
      receiver: '0x0000000000000000000000000000000000000002',
      payloadPath: '$outputs.action_1',
      gasLimit: 300000,
    }
  }
  if (type === 'erc20Transfer') {
    return {
      id,
      name: 'ERC20 Transfer',
      type: 'erc20Transfer',
      chainName: SEPOLIA_CHAIN_NAME,
      tokenAddress: DEFAULT_TOKEN_ADDRESS,
      receiverContract: receiverContract || SEPOLIA_SIMULATION_RECEIVER,
      recipientAddress: DEFAULT_RECIPIENT_ADDRESS,
      tokenDecimals: DEFAULT_TOKEN_DECIMALS,
      amountPath: '$outputs.action_http_1.body.number',
      gasLimit: 500000,
    }
  }
  if (type === 'consensus') {
    return { id, name: 'Consensus', type: 'consensus', strategy: 'identical' }
  }
  return { id, name: 'Transform', type: 'transform', template: { value: '$trigger' } }
}
