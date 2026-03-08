import express from 'express'
import path from 'node:path'
import { buildApiRouter } from './api/routes.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

app.use('/api', buildApiRouter())

const uiDir = path.join(process.cwd(), 'src', 'ui')
app.use('/assets', express.static(uiDir))
app.get('/', (_req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'))
})

const port = Number.parseInt(process.env.PORT ?? '4173', 10)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`CRE Local Builder listening on http://localhost:${port}`)
})
