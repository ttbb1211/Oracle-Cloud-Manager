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

    <!-- 计算账户 -->
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
            <th>凭证摘要</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.id">
            <td><span style="font-weight:500">{{ a.name }}</span></td>
            <td><span :class="['badge', providerBadge(a.computeProvider)]">{{ a.computeProvider?.toUpperCase() }}</span>
            </td>
            <td style="font-size:11px;color:var(--text-muted)">
              <span v-if="a.computeProvider === 'oracle'">配置已保存 · {{ a.credentials?.configText ? '✅' : '❌' }}</span>
              <span v-else>{{ a.credentials?.region }} · {{ maskKey(a.credentials?.accessKeyId) }}</span>
            </td>
            <td><span :class="['badge', a.enabled ? 'badge-running' : 'badge-stopped']">{{ a.enabled ? '启用' : '禁用'
                }}</span></td>
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

    <!-- 计算账户 Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editTarget ? '编辑计算账户' : '添加计算账户' }}</h3>
          <button class="modal-close" @click="showModal = false">×</button>
        </div>
        <div class="form-group"><label>账户名 *</label><input v-model="form.name" class="form-control"
            placeholder="如：迪拜账户" /></div>
        <div class="form-group">
          <label>计算 Provider *</label>
          <select v-model="form.computeProvider" class="form-control" :disabled="!!editTarget">
            <option v-for="p in computeProviders" :key="p.key" :value="p.key">{{ p.key.toUpperCase() }}</option>
          </select>
        </div>
        <!-- Oracle -->
        <template v-if="form.computeProvider === 'oracle'">
          <div class="form-group"><label>OCI Config 内容 *</label><textarea v-model="cred.configText" class="form-control"
              rows="4" placeholder="粘贴 .oci/config 全文内容"></textarea></div>
          <div class="form-group"><label>私钥 (oci_api_key.pem) 内容 *</label><textarea v-model="cred.privateKeyText"
              class="form-control" rows="4" placeholder="粘贴私钥文件全文内容"></textarea></div>
        </template>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="showModal = false">取消</button>
          <button class="btn btn-primary" @click="saveAccount" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { accountsApi, providersApi } from '../api/index.js'

const accounts = ref([])
const computeProviders = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editTarget = ref(null)
const testingId = ref(null)

const defForm = () => ({ name: '', computeProvider: 'oracle' })
const form = ref(defForm())
const cred = ref({})

onMounted(async () => {
  const [, provRes] = await Promise.all([load(), providersApi.list()])
  computeProviders.value = provRes.data.compute
})

async function load() {
  loading.value = true
  try {
    const aRes = await accountsApi.list()
    accounts.value = (aRes.data || []).filter(item => item.computeProvider === 'oracle')
  } catch (e) { window.$toast?.(e.message, 'error') } finally { loading.value = false }
}

function openAdd() { editTarget.value = null; form.value = defForm(); cred.value = {}; showModal.value = true }
function openEdit(a) { editTarget.value = a; form.value = { name: a.name, computeProvider: a.computeProvider }; cred.value = { ...a.credentials }; showModal.value = true }

async function saveAccount() {
  if (!form.value.name) return window.$toast?.('请填写账户名', 'error')
  saving.value = true
  try {
    const payload = { ...form.value, credentials: { ...cred.value } }
    editTarget.value ? await accountsApi.update(editTarget.value.id, payload) : await accountsApi.create(payload)
    window.$toast?.('保存成功', 'success'); showModal.value = false; await load()
  } catch (e) { window.$toast?.(e.response?.data?.error || e.message, 'error') } finally { saving.value = false }
}

async function deleteAccount(a) {
  if (!confirm(`删除账户「${a.name}」？`)) return
  try { await accountsApi.delete(a.id); window.$toast?.('已删除', 'success'); await load() }
  catch (e) { window.$toast?.(e.response?.data?.error || e.message, 'error') }
}
async function testAccount(a) {
  testingId.value = a.id
  try { await accountsApi.test(a.id); window.$toast?.(`「${a.name}」连接成功 ✅`, 'success') }
  catch (e) { window.$toast?.(`连接失败: ${e.response?.data?.error || e.message}`, 'error') }
  finally { testingId.value = null }
}
function maskKey(k) { return k ? k.slice(0, 6) + '…' + k.slice(-4) : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '—' }
function providerBadge(p) { return p === 'oracle' ? 'badge-oracle' : 'badge-pending' }
</script>

<style scoped>
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}
</style>
