import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileIR } from '../compiler/index.js'
import { generateIR } from './index.js'

const prompts = [
  'Build a cron workflow that fetches token prices and normalizes JSON output.',
  'Create an HTTP webhook processor that transforms payload and writes report onchain.',
  'On log trigger from an EVM contract, fetch metadata and produce structured output.',
]

describe('AI reliability prompt set', () => {
  it('generates valid IR that compiles for common intents', async () => {
    for (const prompt of prompts) {
      const generated = await generateIR({ prompt })
      expect(generated.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

      const out = await mkdtemp(path.join(tmpdir(), 'cre-ai-'))
      const compiled = await compileIR(generated.ir, out)
      expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
      expect(compiled.generatedFiles.length).toBeGreaterThan(0)
    }
  })
})
