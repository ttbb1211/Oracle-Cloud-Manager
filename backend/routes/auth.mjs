import { Router } from 'express'
import { randomUUID } from 'crypto'
import { settingsDb } from '../db.mjs'

const router = Router()
const sessions = new Map()
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const COOKIE_NAME = 'ocm_session'

function ensureAuthDefaults() {
  settingsDb.data ||= {}
  settingsDb.data.auth ||= {}
  if (typeof settingsDb.data.auth.enabled !== 'boolean') settingsDb.data.auth.enabled = true
  if (!settingsDb.data.auth.username) settingsDb.data.auth.username = 'admin'
  if (!settingsDb.data.auth.password) settingsDb.data.auth.password = 'admin123'
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  return header
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const index = item.indexOf('=')
      if (index === -1) return acc
      const key = item.slice(0, index)
      const value = decodeURIComponent(item.slice(index + 1))
      acc[key] = value
      return acc
    }, {})
}

function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return { token, ...session }
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_TTL_MS / 1000
  const forwardedProto = res.req?.headers?.['x-forwarded-proto']
  const isHttps = forwardedProto === 'https' || res.req?.protocol === 'https'
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ]
  if (isHttps) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function clearSessionCookie(res) {
  const forwardedProto = res.req?.headers?.['x-forwarded-proto']
  const isHttps = forwardedProto === 'https' || res.req?.protocol === 'https'
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ]
  if (isHttps) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function requireAuth(req, res, next) {
  ensureAuthDefaults()
  if (!settingsDb.data.auth.enabled) return next()

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'UNAUTHORIZED' })
  }

  sessions.set(session.token, {
    username: session.username,
    expiresAt: Date.now() + SESSION_TTL_MS
  })
  setSessionCookie(res, session.token)
  req.authUser = { username: session.username }
  next()
}

router.get('/status', async (req, res) => {
  ensureAuthDefaults()
  const session = getSession(req)
  if (session) {
    sessions.set(session.token, {
      username: session.username,
      expiresAt: Date.now() + SESSION_TTL_MS
    })
    setSessionCookie(res, session.token)
  }

  res.json({
    enabled: settingsDb.data.auth.enabled,
    authenticated: !settingsDb.data.auth.enabled || !!session,
    user: session ? { username: session.username } : null,
    hint: settingsDb.data.auth.enabled
      ? {
          defaultUsername: settingsDb.data.auth.username,
          defaultPassword: settingsDb.data.auth.password
        }
      : null
  })
})

router.post('/login', async (req, res) => {
  ensureAuthDefaults()
  const { username = '', password = '' } = req.body || {}

  if (!settingsDb.data.auth.enabled) {
    return res.json({ success: true, authenticated: true, user: null })
  }

  if (username !== settingsDb.data.auth.username || password !== settingsDb.data.auth.password) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }

  const token = randomUUID()
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS
  })
  setSessionCookie(res, token)

  res.json({
    success: true,
    authenticated: true,
    user: { username }
  })
})

router.post('/logout', async (req, res) => {
  const session = getSession(req)
  if (session) {
    sessions.delete(session.token)
  }
  clearSessionCookie(res)
  res.json({ success: true })
})

export default router
