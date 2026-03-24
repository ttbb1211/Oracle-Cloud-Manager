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

router.put('/auth', async (req, res) => {
  try {
    const { enabled = true, username = '', password = '' } = req.body || {}
    const trimmedUsername = String(username || '').trim()
    const trimmedPassword = String(password || '').trim()

    if (!trimmedUsername) {
      return res.status(400).json({ error: '登录用户名不能为空' })
    }
    if (!trimmedPassword) {
      return res.status(400).json({ error: '登录密码不能为空' })
    }

    settingsDb.data.auth = {
      enabled: enabled !== false,
      username: trimmedUsername,
      password: trimmedPassword,
    }

    await settingsDb.write()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
