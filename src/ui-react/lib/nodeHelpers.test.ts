import { describe, expect, it } from 'vitest'
import { makeNode } from './nodeHelpers'
import type { WorkflowNode } from '../types/workflow'

describe('ui node helpers', () => {
  it('uses the most recent httpFetch action for erc20Transfer amountPath defaults', () => {
    const existingActions: WorkflowNode[] = [
      { id: 'action_2', name: 'Fetch One', type: 'httpFetch' },
      { id: 'action_3', name: 'Transform', type: 'transform' },
      { id: 'action_7', name: 'Fetch Two', type: 'httpFetch' },
    ]

    const node = makeNode(
      'erc20Transfer',
      7,
      '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
      existingActions,
    )

    expect(node.type).toBe('erc20Transfer')
    expect(node.amountPath).toBe('$outputs.action_7.body.number')
  })

  it('falls back to a valid placeholder output reference when no httpFetch exists', () => {
    const existingActions: WorkflowNode[] = [{ id: 'action_2', name: 'Transform', type: 'transform' }]

    const node = makeNode(
      'erc20Transfer',
      2,
      '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
      existingActions,
    )

    expect(node.type).toBe('erc20Transfer')
    expect(node.amountPath).toBe('$outputs.action_1.body.number')
  })
})
