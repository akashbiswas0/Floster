import type { RuntimeConfig, TargetConfig } from './types.js'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export const SEPOLIA_CHAIN_NAME = 'ethereum-testnet-sepolia'
export const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const SEPOLIA_TX_EXPLORER_BASE_URL = 'https://sepolia.etherscan.io/tx/'

export const SEPOLIA_SIMULATION_FORWARDER = '0x15fC6ae953E024d975e77382eEeC56A9101f9F88'
export const SEPOLIA_PRODUCTION_FORWARDER = '0xF8344CFd5c43616a4366C34E3EEE75af79a74482'

export const SEPOLIA_PRODUCTION_RECEIVER = '0x7578EbC461DfBC93c2e5Ce93a55163D5fD7D1c91'
export const SEPOLIA_SIMULATION_RECEIVER = '0x1729388a37eDC095c17C381fbe43Fb7EbeC44499'

export const DEFAULT_TARGETS: Record<string, TargetConfig> = {
  'local-simulation': {
    rpcs: [{ chainName: SEPOLIA_CHAIN_NAME, url: SEPOLIA_RPC_URL }],
    broadcast: false,
    receiverContract: SEPOLIA_SIMULATION_RECEIVER,
    chainExplorerTxBaseUrl: SEPOLIA_TX_EXPLORER_BASE_URL,
  },
  'sepolia-broadcast': {
    rpcs: [{ chainName: SEPOLIA_CHAIN_NAME, url: SEPOLIA_RPC_URL }],
    broadcast: true,
    receiverContract: SEPOLIA_SIMULATION_RECEIVER,
    chainExplorerTxBaseUrl: SEPOLIA_TX_EXPLORER_BASE_URL,
  },
  'sepolia-production': {
    rpcs: [{ chainName: SEPOLIA_CHAIN_NAME, url: SEPOLIA_RPC_URL }],
    broadcast: false,
    receiverContract: SEPOLIA_PRODUCTION_RECEIVER,
    chainExplorerTxBaseUrl: SEPOLIA_TX_EXPLORER_BASE_URL,
  },
}

export function buildDefaultRuntime(defaultTarget = 'local-simulation'): RuntimeConfig {
  return {
    defaultTarget,
    targets: {
      'local-simulation': structuredClone(DEFAULT_TARGETS['local-simulation']!),
      'sepolia-broadcast': structuredClone(DEFAULT_TARGETS['sepolia-broadcast']!),
      'sepolia-production': structuredClone(DEFAULT_TARGETS['sepolia-production']!),
    },
  }
}

export function ensureTargetConfig(runtime: RuntimeConfig, targetName: string): RuntimeConfig {
  if (runtime.targets[targetName]) {
    return runtime
  }

  const fallback = DEFAULT_TARGETS[targetName]
  if (!fallback) {
    return runtime
  }

  return {
    ...runtime,
    targets: {
      ...runtime.targets,
      [targetName]: structuredClone(fallback),
    },
  }
}

export function getTargetBroadcast(runtime: RuntimeConfig, targetName: string): boolean {
  return runtime.targets[targetName]?.broadcast === true
}
