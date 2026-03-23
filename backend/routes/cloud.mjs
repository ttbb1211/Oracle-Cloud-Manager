import { Router } from 'express'
import { accountsDb } from '../db.mjs'
import { getComputeProvider } from '../providers/registry.mjs'

const router = Router({ mergeParams: true })
const READ_TIMEOUT_MS = Number(process.env.CLOUD_READ_TIMEOUT_MS || 8000)

function requireAccount(id) {
  const account = accountsDb.data.accounts.find((item) => item.id === id && item.enabled !== false)
  if (!account) {
    throw new Error(`计算账户不存在: ${id}`)
  }
  return account
}

function withTimeout(promise, ms, message) {
  let timer = null

  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ])
}

router.get('/instances', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    const result = await withTimeout(
      provider.listInstances(),
      READ_TIMEOUT_MS,
      `${account.computeProvider} 实例列表请求超时（>${READ_TIMEOUT_MS}ms）`
    )
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/instances/:instanceId', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    const result = await withTimeout(
      provider.getInstance(req.params.instanceId),
      READ_TIMEOUT_MS,
      `${account.computeProvider} 实例详情请求超时（>${READ_TIMEOUT_MS}ms）`
    )
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/capabilities', (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    res.json({ provider: account.computeProvider, capabilities: provider.constructor.capabilities || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.post('/instances/:instanceId/action', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    const { action = 'START' } = req.body
    res.json({ success: true, ...(await provider.instanceAction(req.params.instanceId, action)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.post('/instances', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    res.status(202).json({ success: true, ...(await provider.createInstance(req.body || {})) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/instances/:instanceId', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    res.json({ success: true, ...(await provider.deleteInstance(req.params.instanceId)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/instances/:instanceId/switch-ip', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    const providerCapabilities = provider.constructor.capabilities || []

    if (!providerCapabilities.includes('switch_ip') && !providerCapabilities.includes('elastic_ip')) {
      return res.status(400).json({ error: `${account.computeProvider} 不支持切换 IP` })
    }

    const result = await provider.switchPublicIp(req.params.instanceId)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/instances/:instanceId/add-ipv6', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)

    if (!(provider.constructor.capabilities || []).includes('ipv6')) {
      return res.status(400).json({ error: `${account.computeProvider} 不支持 IPv6` })
    }

    res.json({ success: true, ...(await provider.addIpv6(req.params.instanceId)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.put('/instances/:instanceId/shape', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)

    if (!(provider.constructor.capabilities || []).includes('modify_config')) {
      return res.status(400).json({ error: `${account.computeProvider} 不支持修改配置` })
    }

    res.json({ success: true, ...(await provider.modifyInstanceConfig(req.params.instanceId, req.body)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/instances/:instanceId/firewall/allow-all', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    res.json({ success: true, ...(await provider.allowAllInboundTraffic(req.params.instanceId)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/volumes', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)

    if (!(provider.constructor.capabilities || []).includes('list_boot_volumes')) {
      return res.status(400).json({ error: `${account.computeProvider} 不支持管理引导卷` })
    }

    const result = await withTimeout(
      provider.listBootVolumes(),
      READ_TIMEOUT_MS,
      `${account.computeProvider} 卷列表请求超时（>${READ_TIMEOUT_MS}ms）`
    )
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/volumes/:volumeId', async (req, res) => {
  try {
    const account = requireAccount(req.params.accountId)
    const provider = getComputeProvider(account)
    res.json({ success: true, ...(await provider.deleteBootVolume(req.params.volumeId)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
