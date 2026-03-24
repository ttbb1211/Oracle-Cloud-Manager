<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>系统设置</h1>
        <p>配置 Telegram 通知相关参数</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">Telegram 通知</h3>
      <div class="form-group">
        <label>Bot Token</label>
        <input
          v-model="tgForm.botToken"
          class="form-control"
          type="password"
          placeholder="请输入 Telegram Bot Token"
        />
      </div>
      <p class="setting-hint" v-if="tgForm.botTokenPreview">当前已保存 Token：{{ tgForm.botTokenPreview }}</p>
      <div class="form-group">
        <label>Chat ID</label>
        <input
          v-model="tgForm.chatId"
          class="form-control"
          placeholder="请输入个人或群组 Chat ID"
        />
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" @click="saveTg" :disabled="savingTg || testingTg">
          {{ savingTg ? '保存中...' : '保存 Telegram 配置' }}
        </button>
        <button class="btn btn-ghost" @click="testTg" :disabled="savingTg || testingTg">
          {{ testingTg ? '发送中...' : '发送测试消息' }}
        </button>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">关于</h3>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-secondary)">
        <div>版本：<span style="color:var(--text-primary)">1.0.0</span></div>
        <div>
          后端：
          <a :href="backendHealthUrl" target="_blank" rel="noreferrer" style="color:var(--accent)">
            {{ backendBaseUrl }}
          </a>
        </div>
        <div>
          GitHub：
          <a href="https://github.com/ttbb1211/Oracle-Cloud-Manager" target="_blank" rel="noreferrer" style="color:var(--accent)">
            https://github.com/ttbb1211/Oracle-Cloud-Manager
          </a>
        </div>
        <div>技术栈：Express.js / Vue 3 / Vite / lowdb</div>
        <div>支持的云：Oracle Cloud</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { settingsApi } from '../api/index.js'

const tgForm = ref({ botToken: '', chatId: '', botTokenPreview: '' })
const savingTg = ref(false)
const testingTg = ref(false)

const backendBaseUrl = computed(() => window.location.origin)
const backendHealthUrl = computed(() => `${backendBaseUrl.value}/api/health`)

onMounted(async () => {
  try {
    const res = await settingsApi.get()
    const settings = res.data || {}
    tgForm.value.botToken = ''
    tgForm.value.botTokenPreview = settings.telegram?.botTokenPreview || ''
    tgForm.value.chatId = settings.telegram?.chatId || ''

  } catch (_) {
  }
})

async function saveTg() {
  savingTg.value = true
  try {
    await settingsApi.updateTelegram({
      botToken: tgForm.value.botToken,
      chatId: tgForm.value.chatId,
    })
    if (tgForm.value.botToken) {
      tgForm.value.botTokenPreview = `${tgForm.value.botToken.slice(0, 10)}***${tgForm.value.botToken.slice(-6)}`
      tgForm.value.botToken = ''
    }
    window.$toast?.('Telegram 配置已保存', 'success')
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  } finally {
    savingTg.value = false
  }
}

async function testTg() {
  testingTg.value = true
  try {
    await settingsApi.sendTelegramTest()
    window.$toast?.('测试消息已发送，请去 Telegram 查看', 'success')
  } catch (e) {
    window.$toast?.(e.response?.data?.error || e.message, 'error')
  } finally {
    testingTg.value = false
  }
}
</script>

<style scoped>
.setting-hint {
  margin-top: -4px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
