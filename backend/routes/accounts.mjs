import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { accountsDb } from '../db.mjs'
import { listProviders } from '../providers/registry.mjs'
import { getComputeProvider } from '../providers/registry.mjs'

const router = Router()

function normalizeAccountInput(body = {}) {
  const { name, computeProvider, credentials = {}, enabled = true } = body
  return {
    id: uuidv4(),
    name,
    computeProvider,
    credentials,
    enabled,
    createdAt: new Date().toISOString()
  }
}

function ensureOraclePayload(body = {}) {
  const { name, computeProvider, credentials = {} } = body
  if (!name || !computeProvider) {
    throw new Error('name 和 computeProvider 为必填项')
  }
  if (computeProvider !== 'oracle') {
    throw new Error('当前仅支持 Oracle 账户')
  }
  if (!credentials.configText || !credentials.privateKeyText) {
    throw new Error('请填写 OCI Config 与私钥内容')
  }
}

// ─── 计算账户 ──────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json(accountsDb.data.accounts)
})

router.get('/providers', (req, res) => {
  const providers = listProviders()
  providers.compute = providers.compute.filter((item) => item.key === 'oracle')
  providers.dns = []
  res.json(providers)
})

router.post('/', async (req, res) => {
  try {
    const { name, computeProvider } = req.body
    if (!name || !computeProvider) return res.status(400).json({ error: 'name 和 computeProvider 为必填项' })

    const account = normalizeAccountInput(req.body)
    accountsDb.data.accounts.push(account)
    await accountsDb.write()
    res.status(201).json(account)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/oracle/regions/discover', async (req, res) => {
  try {
    ensureOraclePayload(req.body)
    const draftAccount = normalizeAccountInput(req.body)
    const provider = getComputeProvider(draftAccount)
    const [regions, tenancy] = await Promise.all([
      provider.listSubscribedRegions(),
      provider.getTenancyInfo()
    ])
    res.json({
      success: true,
      profile: provider.profile,
      tenancy,
      regions,
      count: regions.length
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/oracle/regions/import', async (req, res) => {
  try {
    ensureOraclePayload(req.body)
    const { selectedRegionCodes = [], baseName } = req.body
    const draftAccount = normalizeAccountInput(req.body)
    const provider = getComputeProvider(draftAccount)
    const [discoveredRegions, tenancy] = await Promise.all([
      provider.listSubscribedRegions(),
      provider.getTenancyInfo()
    ])
    const regionFilter = new Set((selectedRegionCodes || []).filter(Boolean))
    const targetRegions = regionFilter.size
      ? discoveredRegions.filter((item) => regionFilter.has(item.regionCode || item.regionName))
      : discoveredRegions

    if (!targetRegions.length) {
      return res.status(400).json({ error: '未找到可导入的 region' })
    }

    const effectiveBaseName = (baseName || tenancy?.tenancyName || req.body.name || '').trim()
    const drafts = provider.buildRegionAccountDrafts(effectiveBaseName, targetRegions)
    const existingOracleAccounts = accountsDb.data.accounts.filter((item) => item.computeProvider === 'oracle')
    const existingRegions = new Set(
      existingOracleAccounts.map((item) => {
        const creds = item.credentials || {}
        return `${item.name}::${creds.region || ''}`
      })
    )

    const created = []
    const skipped = []

    for (const draft of drafts) {
      const regionCode = draft.credentials?.region || ''
      const dedupeKey = `${draft.name}::${regionCode}`
      if (existingRegions.has(dedupeKey)) {
        skipped.push({ name: draft.name, region: regionCode, reason: '账户已存在' })
        continue
      }

      const account = {
        ...draft,
        id: uuidv4(),
        createdAt: new Date().toISOString()
      }
      accountsDb.data.accounts.push(account)
      existingRegions.add(dedupeKey)
      created.push(account)
    }

    await accountsDb.write()
    res.status(201).json({
      success: true,
      created,
      skipped,
      createdCount: created.length,
      skippedCount: skipped.length
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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

router.post('/:id/test', async (req, res) => {
  try {
    const account = accountsDb.data.accounts.find(a => a.id === req.params.id)
    if (!account) return res.status(404).json({ error: '账户不存在' })
    const provider = getComputeProvider(account)
    await provider.listInstances()
    res.json({ success: true, message: `${account.computeProvider} 连接成功` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
