import { Router } from 'express'
import { settingsDb } from '../db.mjs'
import { sanitizeSettings } from '../utils/sanitize.mjs'

const router = Router()

router.get('/', (req, res) => {
  res.json(sanitizeSettings(settingsDb.data || {}))
})

router.put('/telegram', async (req, res) => {
  try {
    const nextTelegram = { ...settingsDb.data.telegram }
    if (typeof req.body?.chatId !== 'undefined') {
      nextTelegram.chatId = req.body.chatId
    }
    if (String(req.body?.botToken || '').trim()) {
      nextTelegram.botToken = String(req.body.botToken).trim()
    }
    settingsDb.data.telegram = nextTelegram
    await settingsDb.write()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
