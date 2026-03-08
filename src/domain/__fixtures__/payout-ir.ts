import type { WorkflowIR } from '../types.js'

export const erc20IRFixture: WorkflowIR = {
  irVersion: '1.0',
  metadata: {
    name: 'erc20-transfer-workflow',
    description: 'Fixture for ERC20 transfer workflow',
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
        receiverContract: '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
        chainExplorerTxBaseUrl: 'https://sepolia.etherscan.io/tx/',
      },
      'sepolia-broadcast': {
        rpcs: [
          {
            chainName: 'ethereum-testnet-sepolia',
            url: 'https://ethereum-sepolia-rpc.publicnode.com',
          },
        ],
        broadcast: true,
        receiverContract: '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
        chainExplorerTxBaseUrl: 'https://sepolia.etherscan.io/tx/',
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
      name: 'ERC20 Transfer',
      type: 'erc20Transfer',
      chainName: 'ethereum-testnet-sepolia',
      tokenAddress: '0xec4d762FcDCBAa1f9b37760DEe12F508c3F6b53E',
      receiverContract: '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499',
      recipientAddress: '0xe473137d53c02A3FAEE0bC8a976a094c978d4b86',
      tokenDecimals: 6,
      amountPath: '$outputs.action_http_1.body.number',
      gasLimit: 500000,
    },
  ],
  edges: [
    { from: 'trigger_1', to: 'action_http_1' },
    { from: 'action_http_1', to: 'action_transfer_1' },
  ],
}
