export interface TemplateSnippet {
  id: string
  title: string
  tags: string[]
  summary: string
  pattern: {
    trigger: 'cron' | 'http' | 'evmLog'
    actions: Array<'httpFetch' | 'evmRead' | 'evmWrite' | 'erc20Transfer' | 'transform' | 'consensus'>
  }
}

export const CRE_TEMPLATE_SNIPPETS: TemplateSnippet[] = [
  {
    id: 'read-data-feeds-ts',
    title: 'Read Data Feeds (TS)',
    tags: ['cron', 'evmRead', 'feeds', 'arbitrum'],
    summary: 'Scheduled reads against Chainlink price feed contracts and return scaled values.',
    pattern: {
      trigger: 'cron',
      actions: ['evmRead', 'transform'],
    },
  },
  {
    id: 'indexer-fetch-ts',
    title: 'Indexer Fetch (TS)',
    tags: ['cron', 'httpFetch', 'graphql', 'consensus'],
    summary: 'Scheduled HTTP POST to indexer endpoint with deterministic consensus aggregation.',
    pattern: {
      trigger: 'cron',
      actions: ['httpFetch', 'consensus', 'transform'],
    },
  },
  {
    id: 'custom-data-feed-ts',
    title: 'Custom Data Feed (TS)',
    tags: ['cron', 'httpFetch', 'evmWrite', 'por', 'log-trigger'],
    summary: 'Fetch offchain data and submit onchain reports; optionally react to log triggers.',
    pattern: {
      trigger: 'cron',
      actions: ['httpFetch', 'transform', 'evmWrite'],
    },
  },
  {
    id: 'asset-log-trigger-ts',
    title: 'Tokenized Asset Servicing',
    tags: ['evmLog', 'http', 'httpFetch', 'evmWrite'],
    summary: 'React to EVM logs and HTTP webhooks; push normalized state updates to offchain and onchain systems.',
    pattern: {
      trigger: 'evmLog',
      actions: ['transform', 'httpFetch', 'evmWrite'],
    },
  },
]
