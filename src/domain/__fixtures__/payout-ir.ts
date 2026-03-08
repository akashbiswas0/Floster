import type { WorkflowIR } from '../types.js'

export const payoutIRFixture: WorkflowIR = {
  irVersion: '1.0',
  metadata: {
    name: 'payout-workflow',
    description: 'Fixture for payout transfer workflow',
  },
  runtime: {
    defaultTarget: 'local-simulation',
    targets: {
      'local-simulation': {
        rpcs: [
          {
            chainName: 'ethereum-testnet-sepolia',
            url: 'https://ethereum-sepolia-rpc.publicnode.com',
          },
        ],
      },
    },
  },
  triggers: [
    {
      id: 'trigger_1',
      name: 'Cron Trigger',
      type: 'cron',
      schedule: '0 */5 * * * *',
    },
  ],
  actions: [
    {
      id: 'action_http_1',
      name: 'HTTP Fetch',
      type: 'httpFetch',
      method: 'GET',
      url: 'http://localhost:3002/random',
      consensus: 'identical',
    },
    {
      id: 'action_transfer_1',
      name: 'EVM Payout Transfer',
      type: 'evmPayoutTransfer',
      chainName: 'ethereum-testnet-sepolia',
      receiverContract: '0x0000000000000000000000000000000000000002',
      recipientAddress: '0x0000000000000000000000000000000000000003',
      amountPath: '$outputs.action_http_1.body.number',
      gasLimit: 500000,
    },
  ],
  edges: [
    { from: 'trigger_1', to: 'action_http_1' },
    { from: 'action_http_1', to: 'action_transfer_1' },
  ],
}
