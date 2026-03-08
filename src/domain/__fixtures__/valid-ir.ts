import type { WorkflowIR } from '../types.js'

export const validIRFixture: WorkflowIR = {
  irVersion: '1.0',
  metadata: {
    name: 'fixture-workflow',
    description: 'Fixture for tests',
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
      id: 'action_1',
      name: 'Fetch',
      type: 'httpFetch',
      method: 'GET',
      url: 'https://api.coingecko.com/api/v3/ping',
      consensus: 'identical',
    },
    {
      id: 'action_2',
      name: 'Transform',
      type: 'transform',
      template: {
        timestamp: '$runtime.now',
        body: '$outputs.action_1.body',
      },
      llmDriven: true,
      outputSchema: {
        timestamp: 'string',
        body: 'object',
      },
    },
  ],
  edges: [
    { from: 'trigger_1', to: 'action_1' },
    { from: 'action_1', to: 'action_2' },
  ],
}
