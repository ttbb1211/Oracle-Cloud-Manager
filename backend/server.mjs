import cors from 'cors'
import express from 'express'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { resumePersistedTasks } from './queue.mjs'

import accountsRouter from './routes/accounts.mjs'
import authRouter, { requireAuth } from './routes/auth.mjs'
import cloudRouter from './routes/cloud.mjs'
import settingsRouter from './routes/settings.mjs'
import tasksRouter from './routes/tasks.mjs'

import './services/telegramNotifier.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', authRouter)
app.use('/api/accounts', requireAuth, accountsRouter)
app.use('/api/cloud/:accountId', requireAuth, cloudRouter)
app.use('/api/tasks', requireAuth, tasksRouter)
app.use('/api/settings', requireAuth, settingsRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.get('/api/providers', requireAuth, async (req, res) => {
  const { listProviders } = await import('./providers/registry.mjs')
  res.json(listProviders())
})

const frontendDist = join(__dirname, '../frontend/dist')
app.use(express.static(frontendDist))
app.get('/{*path}', (req, res) => {
  res.sendFile(join(frontendDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`)
  console.log('Compute API: /api/cloud/:accountId/instances')
  console.log('Providers API: /api/providers')

  resumePersistedTasks()
    .then((count) => {
      if (count > 0) {
        console.log(`Resumed ${count} persisted task(s)`)
      }
    })
    .catch((err) => {
      console.error('Failed to resume persisted tasks:', err.message)
    })
})
