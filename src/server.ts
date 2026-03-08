import express from 'express'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { buildApiRouter } from './api/routes.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

app.use('/api', buildApiRouter())


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
