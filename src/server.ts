import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { Response } from 'express'
import { buildApiRouter } from './api/routes.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

app.use('/api', buildApiRouter())

const uiDir = path.join(process.cwd(), 'src', 'ui')
app.use('/assets', express.static(uiDir))
app.get('/', (_req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'))
})

// ── Live-reload via Server-Sent Events ──────────────────────────────────────
const reloadClients = new Set<Response>()

app.get('/__reload', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  reloadClients.add(res)
  req.on('close', () => reloadClients.delete(res))
})

let reloadDebounce: ReturnType<typeof setTimeout> | null = null
fs.watch(uiDir, { recursive: true }, () => {
  if (reloadDebounce) clearTimeout(reloadDebounce)
  reloadDebounce = setTimeout(() => {
    for (const client of reloadClients) {
      client.write('data: reload\n\n')
    }
  }, 60)
})
// ────────────────────────────────────────────────────────────────────────────

const port = Number.parseInt(process.env.PORT ?? '4173', 10)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`CRE Local Builder listening on http://localhost:${port}`)
})
