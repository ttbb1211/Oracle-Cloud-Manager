<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>云实例</h1>
        <p>统一管理 Oracle 实例。</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" :disabled="!selectedAccountId || loading" @click="refreshCurrent">
          刷新
        </button>
        <button class="btn btn-primary" :disabled="!selectedAccountId" @click="openCreate">
          新建实例
        </button>
        <button class="btn btn-ghost" :disabled="!selectedAccountId" @click="openVolumesModal">
          管理引导卷
        </button>
      </div>
    </div>

    <div class="account-selector">
      <button v-for="account in visibleAccounts" :key="account.id"
        :class="['account-chip', selectedAccountId === account.id ? 'active' : '']" @click="selectAccount(account.id)">
        <span>🟢</span>
        <span>{{ providerLabel(account.computeProvider) }} / {{ accountChipLabel(account) }}</span>
      </button>
    </div>

    <div v-if="!selectedAccountId" class="card empty-state">
      <div class="empty-icon">!</div>
      <p>请选择一个计算账户。</p>
    </div>

    <div v-else-if="loading" class="card loading-wrap">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <div class="card summary-card">
        <div class="summary-item">
          <span class="summary-label">账户</span>
          <span class="summary-value">{{ selectedAccount?.name || '-' }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">厂商</span>
          <span class="summary-value">{{ providerLabel(selectedAccount?.computeProvider) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">实例数量</span>
          <span class="summary-value">{{ instances.length }}</span>
        </div>
      </div>

      <div v-if="instances.length === 0" class="card empty-state">
        <div class="empty-icon">-</div>
        <p>当前账户下还没有实例。</p>
      </div>

      <div v-else class="instances-grid">
        <div v-for="instance in instances" :key="instance.id" class="card instance-card">
          <div class="instance-card-header">
            <div>
              <div class="instance-name">{{ instance.displayName || instance.id }}</div>
              <div class="instance-subtitle">{{ instance.region || '-' }} / {{ instance.shape || '-' }}</div>
            </div>
            <span :class="['badge', stateClass(instance.state)]">{{ stateLabel(instance.state) }}</span>
          </div>

          <div class="instance-info">
            <div class="info-row">
              <span class="info-label">实例 ID</span>
              <span class="info-value info-mono" :title="instance.id">{{ shortText(instance.id) }}</span>
            </div>
            <div class="info-row" v-if="instance.cpu || instance.memoryGb">
              <span class="info-label">配置</span>
              <span class="info-value">{{ formatConfig(instance) }}</span>
            </div>
            <div class="info-row" v-if="instance.publicIps?.length">
              <span class="info-label">公网 IP</span>
              <div class="ip-list">
                <span v-for="ip in instance.publicIps" :key="ip" class="ip-tag">{{ ip }}</span>
              </div>
            </div>
            <div class="info-row" v-if="instance.privateIps?.length">
              <span class="info-label">私网 IP</span>
              <div class="ip-list">
                <span v-for="ip in instance.privateIps" :key="ip" class="ip-tag ip-tag-muted">{{ ip }}</span>
              </div>
            </div>
            <div class="info-row" v-if="instance.ipv6Addresses?.length">
              <span class="info-label">IPv6</span>
              <span class="info-value" :title="instance.ipv6Addresses[0]">{{ shortText(instance.ipv6Addresses[0], 26)
              }}</span>
            </div>
          </div>

          <div class="divider"></div>
          <div class="action-row">
            <button v-if="['STOPPED', 'TERMINATED'].includes(normalizeState(instance.state))"
              class="btn btn-success btn-sm" @click="runAction(instance, 'START')">
              启动
            </button>
            <button v-if="normalizeState(instance.state) === 'RUNNING'" class="btn btn-warning btn-sm"
              @click="runAction(instance, 'STOP')">
              停止
            </button>
            <button v-if="normalizeState(instance.state) === 'RUNNING'" class="btn btn-ghost btn-sm"
              @click="runAction(instance, 'REBOOT')">
              重启
            </button>
            <button v-if="hasCapability('switch_ip') || hasCapability('elastic_ip')" class="btn btn-ghost btn-sm"
              @click="openSwitchIp(instance)">
              换 IP
            </button>
            <button v-if="hasCapability('ipv6') && !instance.ipv6Addresses?.length" class="btn btn-ghost btn-sm"
              @click="addIpv6(instance)">
              添加 IPv6
            </button>
            <button v-if="hasCapability('modify_config')" class="btn btn-ghost btn-sm"
              @click="openModifyShape(instance)">
              修改配置
            </button>
            <button v-if="hasCapability('allow_all_inbound_traffic')" class="btn btn-ghost btn-sm"
              @click="allowAllFirewall(instance)">
              放通防火墙
            </button>
            <button class="btn btn-danger btn-sm" @click="terminate(instance)">
              删除
            </button>
          </div>
        </div>
      </div>

    </template>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreate">
      <div class="modal">
        <div class="modal-header">
          <h3>创建 Oracle 实例</h3>
          <button class="modal-close" @click="closeCreate">x</button>
        </div>
        <div class="form-group">
          <label>实例规格</label>
          <select v-model="createForm.shape" class="form-control">
            <option value="VM.Standard.A1.Flex">VM.Standard.A1.Flex</option>
            <option value="VM.Standard.E2.1.Micro">VM.Standard.E2.1.Micro</option>
            <option value="VM.Standard3.Flex">VM.Standard3.Flex</option>
          </select>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>OCPU</label>
            <input v-model.number="createForm.ocpus" type="number" min="1" class="form-control" />
          </div>
          <div class="form-group">
            <label>内存 (GB)</label>
            <input v-model.number="createForm.memoryGb" type="number" min="1" class="form-control" />
          </div>
        </div>
        <div class="form-group">
          <label>root 密码</label>
          <input v-model="createForm.rootPassword" type="password" class="form-control" placeholder="请输入 Oracle 实例密码" />
          <small class="form-hint">8-100 位，至少包含大写、小写、数字和特殊字符。</small>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeCreate">取消</button>
          <button class="btn btn-primary" :disabled="creating" @click="submitCreate">
            {{ creating ? '提交中...' : '创建实例' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSwitchIpModal" class="modal-overlay" @click.self="closeSwitchIp">
      <div class="modal">
        <div class="modal-header">
          <h3>切换公网 IP</h3>
          <button class="modal-close" @click="closeSwitchIp">x</button>
        </div>
        <p class="modal-desc">
          实例：{{ selectedInstance?.displayName || selectedInstance?.id || '-' }}
        </p>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeSwitchIp">取消</button>
          <button class="btn btn-primary" :disabled="switchingIp" @click="confirmSwitchIp">
            {{ switchingIp ? '执行中...' : '确认切换' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showShapeModal" class="modal-overlay" @click.self="closeShape">
      <div class="modal">
        <div class="modal-header">
          <h3>修改实例配置</h3>
          <button class="modal-close" @click="closeShape">x</button>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>OCPU</label>
            <input v-model.number="shapeForm.ocpus" type="number" min="1" class="form-control" />
          </div>
          <div class="form-group">
            <label>内存 (GB)</label>
            <input v-model.number="shapeForm.memoryGb" type="number" min="1" class="form-control" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeShape">取消</button>
          <button class="btn btn-primary" :disabled="modifyingShape" @click="confirmModifyShape">
            {{ modifyingShape ? '提交中...' : '确认修改' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showVolumesModal" class="modal-overlay" @click.self="closeVolumes">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h3>引导卷列表</h3>
          <button class="modal-close" @click="closeVolumes">x</button>
        </div>
        <div v-if="loadingVolumes" class="loading-wrap">
          <div class="spinner"></div>
        </div>
        <div v-else-if="!volumes.length" class="empty-state">
          <p>没有可管理的引导卷。</p>
        </div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>容量</th>
                <th>状态</th>
                <th>ID</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="volume in volumes" :key="volume.id">
                <td>{{ volume.displayName }}</td>
                <td>{{ volume.sizeInGBs }} GB</td>
                <td>{{ volume.state }}</td>
                <td class="info-mono">{{ shortText(volume.id) }}</td>
                <td>
                  <button class="btn btn-danger btn-sm" @click="deleteVolume(volume.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { accountsApi, cloudApi } from '../api/index.js'

const accounts = ref([])
const selectedAccountId = ref('')
const instances = ref([])
const capabilities = ref([])
const loading = ref(false)

const showCreateModal = ref(false)
const showSwitchIpModal = ref(false)
const showShapeModal = ref(false)
const showVolumesModal = ref(false)

const selectedInstance = ref(null)
const creating = ref(false)
const switchingIp = ref(false)
const modifyingShape = ref(false)
const loadingVolumes = ref(false)

const createForm = ref({})
const switchIpForm = ref({})
const shapeForm = ref({ ocpus: 1, memoryGb: 6 })
const volumes = ref([])

const visibleAccounts = computed(() => {
  const filtered = accounts.value.filter((account) => account.hidden !== true)
  const withoutBaseDuplicates = filtered.filter((account) => {
    const name = String(account.name || '')
    if (name.includes(' / ')) return true
    const hasChildren = filtered.some((other) => String(other.name || '').startsWith(`${name} / `))
    return !hasChildren
  })

  return [...withoutBaseDuplicates].sort((a, b) => {
    const aCred = a.credentials || {}
    const bCred = b.credentials || {}
    const aTenant = String(a.name || '').split(' / ')[0]
    const bTenant = String(b.name || '').split(' / ')[0]
    const tenantCompare = aTenant.localeCompare(bTenant, 'en')
    if (tenantCompare !== 0) return tenantCompare

    const aHome = aCred.isHomeRegion ? 1 : 0
    const bHome = bCred.isHomeRegion ? 1 : 0
    if (aHome !== bHome) return bHome - aHome

    const aRegion = aCred.region || ''
    const bRegion = bCred.region || ''
    const regionCompare = aRegion.localeCompare(bRegion, 'en')
    if (regionCompare !== 0) return regionCompare

    return String(a.name || '').localeCompare(String(b.name || ''), 'en')
  })
})

const selectedAccount = computed(() => visibleAccounts.value.find((item) => item.id === selectedAccountId.value) || null)

onMounted(async () => {
  await loadAccounts()
})

async function loadAccounts() {
  const accountRes = await accountsApi.list()
  accounts.value = (accountRes.data || []).filter((item) => item.computeProvider === 'oracle')

  if (visibleAccounts.value.length && !selectedAccountId.value) {
    await selectAccount(visibleAccounts.value[0].id)
    return
  }

  if (selectedAccountId.value && !visibleAccounts.value.some((item) => item.id === selectedAccountId.value)) {
    if (visibleAccounts.value.length) {
      await selectAccount(visibleAccounts.value[0].id)
    } else {
      selectedAccountId.value = ''
    }
  }
}

async function selectAccount(id) {
  selectedAccountId.value = id
  await refreshCurrent()
}

async function refreshCurrent() {
  if (!selectedAccountId.value) {
    return
  }

  loading.value = true
  instances.value = []
  capabilities.value = []

  try {
    const [capabilitiesRes, instanceRes] = await Promise.all([
      cloudApi.capabilities(selectedAccountId.value),
      cloudApi.listInstances(selectedAccountId.value)
    ])

    capabilities.value = capabilitiesRes.data.capabilities || []
    instances.value = instanceRes.data || []

  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  } finally {
    loading.value = false
  }
}

function providerLabel(provider) {
  if (provider === 'oracle') return 'Oracle'
  return provider || '-'
}

function accountChipLabel(account) {
  return String(account?.name || '').split(' / ')[0] || '-'
}

function hasCapability(capability) {
  return capabilities.value.includes(capability)
}

function openCreate() {
  if (!selectedAccount.value) {
    toast('请先选择计算账户', 'error')
    return
  }

  createForm.value = {
    shape: 'VM.Standard.A1.Flex',
    ocpus: 1,
    memoryGb: 6,
    rootPassword: ''
  }
  showCreateModal.value = true
}

function closeCreate() {
  showCreateModal.value = false
}

async function submitCreate() {
  const passwordError = validateOraclePassword(createForm.value.rootPassword)
  if (passwordError) {
    toast(passwordError, 'error')
    return
  }

  creating.value = true
  try {
    await cloudApi.createInstance(selectedAccountId.value, createForm.value)
    toast('实例创建请求已发送', 'success')
    closeCreate()
    await refreshCurrent()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  } finally {
    creating.value = false
  }
}

async function runAction(instance, action) {
  try {
    await cloudApi.instanceAction(selectedAccountId.value, instance.id, action)
    toast(`${actionLabel(action)}指令已发送`, 'success')
    setTimeout(refreshCurrent, 1500)
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  }
}

async function terminate(instance) {
  const ok = window.confirm(`确认删除实例“${instance.displayName || instance.id}”？此操作不可恢复。`)
  if (!ok) return

  try {
    await cloudApi.deleteInstance(selectedAccountId.value, instance.id)
    toast('实例删除请求已发送', 'success')
    await refreshCurrent()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  }
}

function openSwitchIp(instance) {
  selectedInstance.value = instance
  switchIpForm.value = { dnsAccountId: '', dnsRecord: '' }
  showSwitchIpModal.value = true
}

function closeSwitchIp() {
  showSwitchIpModal.value = false
}

async function confirmSwitchIp() {
  switchingIp.value = true
  try {
    const response = await cloudApi.switchIp(selectedAccountId.value, selectedInstance.value.id, {})
    toast(`IP 已切换为 ${response.data.newIp || response.data.newPublicIp}`, 'success')
    closeSwitchIp()
    await refreshCurrent()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  } finally {
    switchingIp.value = false
  }
}

async function addIpv6(instance) {
  try {
    await cloudApi.addIpv6(selectedAccountId.value, instance.id)
    toast('IPv6 已添加', 'success')
    await refreshCurrent()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  }
}

function openModifyShape(instance) {
  selectedInstance.value = instance
  shapeForm.value = {
    ocpus: instance.cpu || 1,
    memoryGb: instance.memoryGb || 6
  }
  showShapeModal.value = true
}

function closeShape() {
  showShapeModal.value = false
}

async function confirmModifyShape() {
  const ok = window.confirm('确认修改实例配置？该操作可能导致实例短暂中断。')
  if (!ok) return

  modifyingShape.value = true
  try {
    await cloudApi.modifyShape(selectedAccountId.value, selectedInstance.value.id, shapeForm.value)
    toast('配置修改请求已发送', 'success')
    closeShape()
    await refreshCurrent()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  } finally {
    modifyingShape.value = false
  }
}

async function allowAllFirewall(instance) {
  const ok = window.confirm(`确认放通实例“${instance.displayName || instance.id}”的全部入站规则？`)
  if (!ok) return

  try {
    await cloudApi.allowAllFirewall(selectedAccountId.value, instance.id)
    toast('防火墙规则已放通', 'success')
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  }
}

async function openVolumesModal() {
  showVolumesModal.value = true
  loadingVolumes.value = true
  volumes.value = []

  try {
    const response = await cloudApi.listVolumes(selectedAccountId.value)
    volumes.value = response.data || []
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  } finally {
    loadingVolumes.value = false
  }
}

function closeVolumes() {
  showVolumesModal.value = false
}

async function deleteVolume(volumeId) {
  const ok = window.confirm('确认删除该引导卷？')
  if (!ok) return

  try {
    await cloudApi.deleteVolume(selectedAccountId.value, volumeId)
    toast('引导卷删除请求已发送', 'success')
    await openVolumesModal()
  } catch (error) {
    toast(error.response?.data?.error || error.message, 'error')
  }
}

function toast(message, type = 'info') {
  window.$toast?.(message, type)
}

function normalizeState(state) {
  return String(state || '').toUpperCase()
}

function stateClass(state) {
  const current = normalizeState(state)
  if (current === 'RUNNING') return 'badge-running'
  if (['STOPPED', 'TERMINATED'].includes(current)) return 'badge-stopped'
  return 'badge-pending'
}

function stateLabel(state) {
  const current = normalizeState(state)
  const labels = {
    RUNNING: '运行中',
    STOPPED: '已停止',
    STOPPING: '停止中',
    STARTING: '启动中',
    PROVISIONING: '创建中',
    TERMINATED: '已终止',
    TERMINATING: '终止中',
    REBOOTING: '重启中',
    PENDING: '等待中'
  }
  return labels[current] || current || '未知'
}

function actionLabel(action) {
  const labels = {
    START: '启动',
    STOP: '停止',
    REBOOT: '重启',
    HARD_REBOOT: '强制重启'
  }
  return labels[action] || action
}

function formatConfig(instance) {
  const parts = []
  if (instance.cpu) parts.push(`${instance.cpu} vCPU`)
  if (instance.memoryGb) parts.push(`${instance.memoryGb} GB`)
  return parts.join(' / ')
}

function shortText(text, length = 18) {
  if (!text) return '-'
  if (text.length <= length) return text
  return `${text.slice(0, length)}...`
}

function validateOraclePassword(password) {
  const allowedSpecials = /[!#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]/
  const invalidChars = /[^A-Za-z\d!#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]/

  if (!password) return '请输入 Oracle 实例 root 密码'
  if (password.length < 8 || password.length > 100) return 'Oracle 实例密码长度必须为 8 到 100 位'
  if (!/[a-z]/.test(password)) return 'Oracle 实例密码必须至少包含 1 个小写字母'
  if (!/[A-Z]/.test(password)) return 'Oracle 实例密码必须至少包含 1 个大写字母'
  if (!/\d/.test(password)) return 'Oracle 实例密码必须至少包含 1 个数字'
  if (!allowedSpecials.test(password)) return 'Oracle 实例密码必须至少包含 1 个特殊字符'
  if (invalidChars.test(password)) return 'Oracle 实例密码包含不支持的字符'
  return ''
}

</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.loading-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 140px;
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  font-size: 12px;
  color: var(--text-muted);
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.instances-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.instance-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.instance-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.instance-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.instance-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.instance-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.info-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.info-value {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  word-break: break-all;
}

.info-mono {
  font-family: Consolas, monospace;
}

.ip-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.ip-tag-muted {
  background: var(--bg-input);
  color: var(--text-muted);
}

.section-card {
  margin-top: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h2 {
  margin: 0;
  font-size: 15px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.modal-desc {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.modal-wide {
  width: min(960px, 92vw);
  max-width: 960px;
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .instances-grid {
    grid-template-columns: 1fr;
  }
}
</style>
