import express from 'express'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { buildApiRouter } from './api/routes.js'

// Load .env before reading any process.env values
try { process.loadEnvFile(path.resolve(process.cwd(), '.env')) } catch { /* .env is optional */ }

const app = express()
app.use(express.json({ limit: '2mb' }))

const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? ''
app.use('/api', buildApiRouter(openRouterApiKey))


const vite = await createViteServer({
  configFile: path.resolve(process.cwd(), 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'spa',
})
app.use(vite.middlewares)

const port = Number.parseInt(process.env.PORT ?? '4173', 10)
app.listen(port, () => {
  
  console.log(`CRE Local Builder listening on http://localhost:${port}`)
})
