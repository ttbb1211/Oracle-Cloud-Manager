<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>仪表盘</h1>
        <p>查看账户概览与当前任务状态</p>
      </div>
      <button class="btn btn-ghost" @click="loadAll" :disabled="loading">
        <span :class="loading ? 'spinner' : ''">{{ loading ? '' : '刷新' }}</span>
      </button>
    </div>

    <div class="stats-grid stats-grid-single">
      <div class="card stat-card">
        <div class="stat-icon">🟢</div>
        <div class="stat-value">{{ visibleAccounts.length }}</div>
        <div class="stat-label">Oracle 账户</div>
      </div>
    </div>

    <div v-if="visibleAccounts.length > 0" class="card overview-card">
      <div class="section-header">
        <h2>账户概览</h2>
      </div>
      <div class="overview-grid">
        <div v-for="account in visibleAccounts" :key="account.id" class="overview-item">
          <div class="overview-top">
            <div>
              <div class="overview-name">{{ account.name }}</div>
              <div class="overview-meta">{{ providerLabel(account.computeProvider) }}</div>
            </div>
            <span :class="['badge', account.enabled === false ? 'badge-stopped' : 'badge-running']">
              {{ account.enabled === false ? '已禁用' : '已启用' }}
            </span>
          </div>
          <div class="overview-extra">
            <span>ID: {{ shortText(account.id, 16) }}</span>
            <span>创建于 {{ formatDate(account.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && accounts.length === 0" class="card empty-card">
      <div class="empty-title">欢迎使用 Oracle Cloud Manager</div>
      <div class="empty-text">当前还没有配置任何 Oracle 计算账户。</div>
      <router-link to="/accounts" class="btn btn-primary">前往添加账户</router-link>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { accountsApi, tasksApi } from '../api/index.js'

const accounts = ref([])
const pendingTasks = ref(0)
const loading = ref(false)

const oracleAccounts = computed(() => accounts.value.filter((item) => item.computeProvider === 'oracle'))

const visibleAccounts = computed(() => {
  const filtered = oracleAccounts.value.filter((account) => account.hidden !== true)
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

onMounted(loadAll)

async function loadAll() {
  loading.value = true
  try {
    const [accountRes, taskRes] = await Promise.all([
      accountsApi.list(),
      tasksApi.list({ status: 'running' })
    ])

    accounts.value = (accountRes.data || []).filter((item) => item.computeProvider === 'oracle')
    pendingTasks.value = taskRes.data.length
  } catch (e) {
    window.$toast?.(`加载失败: ${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

function providerLabel(provider) {
  if (provider === 'oracle') return 'Oracle'
  return provider || '-'
}

function shortText(text, length = 18) {
  if (!text) return '-'
  return text.length <= length ? text : `${text.slice(0, length)}...`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
</script>

<style scoped>
.overview-card {
  margin-top: 24px;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0;
  font-size: 15px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.overview-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  background: var(--bg-elevated);
}

.overview-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.overview-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.overview-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.overview-extra {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.empty-card {
  margin-top: 24px;
  padding: 48px;
  text-align: center;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.empty-text {
  color: var(--text-muted);
  margin-bottom: 20px;
}

.stats-grid-single {
  grid-template-columns: minmax(260px, 520px);
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid-single {
    grid-template-columns: 1fr;
  }
}
</style>
