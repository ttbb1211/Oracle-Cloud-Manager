<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>账户管理</h1>
        <p>管理 Oracle 计算账户</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" @click="openAdd">+ 计算账户</button>
      </div>
    </div>

    <h2 class="section-title">☁️ 计算账户</h2>
    <div v-if="accounts.length === 0" class="card empty-state" style="margin-bottom:20px">
      <div class="empty-icon">🖥️</div>
      <p>暂无计算账户</p>
    </div>
    <div v-else class="card table-wrap" style="margin-bottom:20px">
      <table>
        <thead>
          <tr>
            <th>账户名</th>
            <th>Provider</th>
            <th>Region</th>
            <th>凭证摘要</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.id">
            <td>
              <span style="font-weight:500">{{ a.name }}</span>
              <span v-if="a.credentials?.isHomeRegion" class="region-home-tag">HOME</span>
            </td>
            <td>
              <span :class="['badge', providerBadge(a.computeProvider)]">{{ a.computeProvider?.toUpperCase() }}</span>
            </td>
            <td style="font-size:12px;color:var(--text-secondary)">
              {{ a.credentials?.regionKey || a.credentials?.regionName || a.credentials?.region || '—' }}
            </td>
            <td style="font-size:11px;color:var(--text-muted)">
              <span v-if="a.computeProvider === 'oracle'">配置已保存 · {{ a.credentials?.configText ? '✅' : '❌' }}</span>
              <span v-else>{{ a.credentials?.region }} · {{ maskKey(a.credentials?.accessKeyId) }}</span>
            </td>
            <td>
              <span :class="['badge', a.enabled ? 'badge-running' : 'badge-stopped']">{{ a.enabled ? '启用' : '禁用' }}</span>
            </td>
            <td style="font-size:11px;color:var(--text-muted)">{{ fmtDate(a.createdAt) }}</td>
            <td>
              <div class="action-row">
                <button class="btn btn-ghost btn-sm" @click="testAccount(a)" :disabled="testingId === a.id">
                  {{ testingId === a.id ? '…' : '测试' }}
                </button>
                <button class="btn btn-ghost btn-sm" @click="openEdit(a)">编辑</button>
                <button class="btn btn-danger btn-sm" @click="deleteAccount(a)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h3>{{ editTarget ? '编辑计算账户' : '添加计算账户' }}</h3>
          <button class="modal-close" @click="showModal = false">×</button>
        </div>
        <div class="form-group">
          <label>账户名 *</label>
          <input v-model="form.name" class="form-control" placeholder="如：甲骨文账户" />
        </div>
        <div class="form-group">
          <label>计算 Provider *</label>
          <select v-model="form.computeProvider" class="form-control" :disabled="!!editTarget">
            <option v-for="p in computeProviders" :key="p.key" :value="p.key">{{ p.key.toUpperCase() }}</option>
          </select>
        </div>

        <template v-if="form.computeProvider === 'oracle'">
          <div class="form-group">
            <label>OCI Config 内容 *</label>
            <textarea
              v-model="cred.configText"
              class="form-control"
              rows="6"
              placeholder="粘贴 .oci/config 全文内容"
            ></textarea>
          </div>
          <div class="form-group">
            <label>私钥 (oci_api_key.pem) 内容 *</label>
            <textarea
              v-model="cred.privateKeyText"
              class="form-control"
              rows="6"
              placeholder="粘贴私钥文件全文内容"
            ></textarea>
          </div>

          <div v-if="!editTarget" class="region-toolbox card-subtle">
            <div class="region-toolbox-header">
              <div>
                <div class="region-toolbox-title">多区号导入</div>
                <div class="region-toolbox-desc">用同一套凭据识别已订阅 region，并一键拆成多条账户。</div>
              </div>
              <button class="btn btn-ghost btn-sm" @click="discoverRegions" :disabled="discoveringRegions">
                {{ discoveringRegions ? '识别中…' : '识别已订阅 Region' }}
              </button>
            </div>

            <div v-if="discoveredRegions.length" class="region-results">
              <div class="region-actions-row">
                <label class="checkbox-inline">
                  <input type="checkbox" :checked="allRegionsSelected" @change="toggleAllRegions($event.target.checked)" />
                  <span>全选</span>
                </label>
                <span class="region-summary">
                  租户：{{ discoveredTenancyName || '—' }} · 已识别 {{ discoveredRegions.length }} 个 region，已选 {{ selectedRegionCodes.length }} 个
                </span>
              </div>

              <div class="region-grid">
                <label v-for="region in discoveredRegions" :key="region.regionCode" class="region-item">
                  <input type="checkbox" :value="region.regionCode" v-model="selectedRegionCodes" />
                  <div>
                    <div class="region-name">
                      {{ region.regionCode }}
                      <span v-if="region.isHomeRegion" class="region-home-tag">HOME</span>
                    </div>
                    <div class="region-code">{{ region.regionKey || region.regionName || region.regionCode }}</div>
                  </div>
                </label>
              </div>

              <div class="modal-footer" style="padding: 12px 0 0;">
                <button class="btn btn-primary" @click="importRegions" :disabled="importingRegions || !selectedRegionCodes.length">
                  {{ importingRegions ? '生成中…' : '按选中 Region 批量生成账户' }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <div class="modal-footer">
          <button class="btn btn-ghost" @click="showModal = false">取消</button>
          <button class="btn btn-primary" @click="saveAccount" :disabled="saving">{{ saving ? '保存中…' : '保存当前账户' }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { accountsApi, providersApi } from '../api/index.js'

const accounts = ref([])
const computeProviders = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editTarget = ref(null)
const testingId = ref(null)
const discoveringRegions = ref(false)
const importingRegions = ref(false)
const discoveredRegions = ref([])
const selectedRegionCodes = ref([])
const discoveredTenancyName = ref('')

const defForm = () => ({ name: '', computeProvider: 'oracle' })
const form = ref(defForm())
const cred = ref({})

const allRegionsSelected = computed(() => {
  return discoveredRegions.value.length > 0 && selectedRegionCodes.value.length === discoveredRegions.value.length
})

onMounted(async () => {
  const [, provRes] = await Promise.all([load(), providersApi.list()])
  computeProviders.value = provRes.data.compute
})

async function load() {
  loading.value = true
  try {
    const aRes = await accountsApi.list()
    accounts.value = (aRes.data || []).filter(item => item.computeProvider === 'oracle')
  } catch (e) {
    window.$toast?.(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function resetRegionDiscovery() {
  discoveredRegions.value = []
  selectedRegionCodes.value = []
  discoveredTenancyName.value = ''
}

function openAdd() {
  editTarget.value = null
  form.value = defForm()
  cred.value = {}
  resetRegionDiscovery()
  showModal.value = true
}

function openEdit(a) {
  editTarget.value = a
  form.value = { name: a.name, computeProvider: a.computeProvider }
  cred.value = { ...a.credentials }
  resetRegionDiscovery()
  showModal.value = true
}

function buildOraclePayload() {
  return { ...form.value, credentials: { ...cred.value } }
}

function validateOracleInput() {
  if (!form.value.name) {
    window.$toast?.('请填写账户名', 'error')
    return false
  }
  if (form.value.computeProvider === 'oracle' && (!cred.value.configText || !cred.value.privateKeyText)) {
    window.$toast?.('请填写 OCI Config 与私钥', 'error')
    return false
  }
  return true
}

async function discoverRegions() {
  if (!validateOracleInput()) return

  discoveringRegions.value = true
  try {
    const response = await accountsApi.discoverRegions(buildOraclePayload())
    discoveredTenancyName.value = response.data.tenancy?.tenancyName || ''
    discoveredRegions.value = response.data.regions || []
    selectedRegionCodes.value = discoveredRegions.value.map(item => item.regionCode)
    window.$toast?.(`租户 ${discoveredTenancyName.value || '—'}：识别到 ${response.data.count || discoveredRegions.value.length} 个已订阅 region`, 'success')
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  } finally {
    discoveringRegions.value = false
  }
}

function toggleAllRegions(checked) {
  selectedRegionCodes.value = checked ? discoveredRegions.value.map(item => item.regionCode) : []
}

async function importRegions() {
  if (!validateOracleInput()) return
  if (!selectedRegionCodes.value.length) {
    window.$toast?.('请至少选择一个 region', 'error')
    return
  }

  importingRegions.value = true
  try {
    const response = await accountsApi.importRegions({
      ...buildOraclePayload(),
      baseName: discoveredTenancyName.value || form.value.name,
      selectedRegionCodes: selectedRegionCodes.value
    })
    const { createdCount = 0, skippedCount = 0 } = response.data || {}
    window.$toast?.(`已生成 ${createdCount} 个账户${skippedCount ? `，跳过 ${skippedCount} 个重复项` : ''}`, 'success')
    showModal.value = false
    await load()
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  } finally {
    importingRegions.value = false
  }
}

async function saveAccount() {
  if (!validateOracleInput()) return
  saving.value = true
  try {
    const payload = buildOraclePayload()
    if (editTarget.value) {
      await accountsApi.update(editTarget.value.id, payload)
    } else {
      await accountsApi.create(payload)
    }
    window.$toast?.('保存成功', 'success')
    showModal.value = false
    await load()
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function deleteAccount(a) {
  if (!confirm(`删除账户「${a.name}」？`)) return
  try {
    await accountsApi.delete(a.id)
    window.$toast?.('已删除', 'success')
    await load()
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  }
}

async function testAccount(a) {
  testingId.value = a.id
  try {
    await accountsApi.test(a.id)
    window.$toast?.(`「${a.name}」连接成功 ✅`, 'success')
  } catch (e) {
    window.$toast?.(`连接失败: ${e.response?.data?.error || e.message}`, 'error')
  } finally {
    testingId.value = null
  }
}

function maskKey(k) {
  return k ? k.slice(0, 6) + '…' + k.slice(-4) : '—'
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '—'
}

function providerBadge(p) {
  return p === 'oracle' ? 'badge-oracle' : 'badge-pending'
}
</script>

<style scoped>
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.modal-wide {
  width: min(960px, 92vw);
  max-width: 960px;
}

.card-subtle {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.region-toolbox {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.region-toolbox-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.region-toolbox-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.region-toolbox-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.region-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.region-actions-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.region-summary {
  font-size: 12px;
  color: var(--text-muted);
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.region-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.region-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.region-code {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-all;
}

.region-home-tag {
  display: inline-flex;
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 16px;
  color: #166534;
  background: #dcfce7;
  vertical-align: middle;
}

.checkbox-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .region-toolbox-header {
    flex-direction: column;
  }

  .region-grid {
    grid-template-columns: 1fr;
  }
}
</style>
