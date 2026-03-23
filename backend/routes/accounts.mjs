import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { accountsDb } from '../db.mjs'
import { listProviders } from '../providers/registry.mjs'
import { getComputeProvider } from '../providers/registry.mjs'

const router = Router()

// ─── 计算账户 ──────────────────────────────────────────────

// GET /api/accounts - 列出所有账户
router.get('/', (req, res) => {
  res.json(accountsDb.data.accounts)
})

// GET /api/accounts/providers - 列出支持的 Provider
router.get('/providers', (req, res) => {
  const providers = listProviders()
  providers.compute = providers.compute.filter((item) => item.key === 'oracle')
  providers.dns = []
  res.json(providers)
})

// POST /api/accounts - 新建账户
router.post('/', async (req, res) => {
  try {
    const { name, computeProvider, credentials = {}, enabled = true } = req.body
    if (!name || !computeProvider) return res.status(400).json({ error: 'name 和 computeProvider 为必填项' })

    const account = {
      id: uuidv4(),
      name, computeProvider, credentials, enabled,
      createdAt: new Date().toISOString()
    }
    accountsDb.data.accounts.push(account)
    await accountsDb.write()
    res.status(201).json(account)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  try {
    const account = accountsDb.data.accounts.find(a => a.id === req.params.id)
    if (!account) return res.status(404).json({ error: '账户不存在' })
    Object.assign(account, req.body, { id: account.id, createdAt: account.createdAt })
    await accountsDb.write()
    res.json(account)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const idx = accountsDb.data.accounts.findIndex(a => a.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '账户不存在' })
    accountsDb.data.accounts.splice(idx, 1)
    await accountsDb.write()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/accounts/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const account = accountsDb.data.accounts.find(a => a.id === req.params.id)
    if (!account) return res.status(404).json({ error: '账户不存在' })
    const provider = getComputeProvider(account)
    await provider.listInstances() // quick test
    res.json({ success: true, message: `${account.computeProvider} 连接成功` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
