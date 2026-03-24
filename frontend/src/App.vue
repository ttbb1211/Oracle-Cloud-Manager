<template>
  <div v-if="authReady && showShell" class="app-shell">
    <nav class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">🌐</span>
        <span class="brand-text brand-text-inline">Oracle Cloud</span>
      </div>

      <div class="nav-section">
        <div class="nav-label">概览</div>
        <router-link to="/" class="nav-item">
          <span>📊</span> 仪表板
        </router-link>
      </div>

      <div class="nav-section">
        <div class="nav-label">管理</div>
        <router-link to="/accounts" class="nav-item">
          <span>👤</span> 账户管理
        </router-link>
        <router-link to="/cloud" class="nav-item">
          <span>☁️</span> 云实例
        </router-link>
      </div>

      <div class="nav-section">
        <div class="nav-label">系统</div>
        <router-link to="/settings" class="nav-item">
          <span>🔧</span> 系统设置
        </router-link>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user" v-if="auth.user">
          <span class="sidebar-user-label">已登录</span>
          <strong>{{ auth.user.username }}</strong>
        </div>
        <button class="btn btn-ghost sidebar-logout" @click="handleLogout">退出登录</button>
      </div>
    </nav>

    <main class="main-content">
      <router-view />
    </main>
  </div>

  <div v-else-if="authReady" class="app-guest">
    <router-view :hint="auth.hint" />
  </div>

  <div v-else class="app-loading-screen">
    <span class="spinner spinner-lg"></span>
  </div>

  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
      {{ t.message }}
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const pendingCount = ref(0)
const toasts = ref([])
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
let sseSource = null

const authReady = computed(() => auth.initialized)
const showShell = computed(() => !auth.enabled || (auth.authenticated && route.path !== '/login'))

onMounted(async () => {
  if (!auth.initialized) {
    try {
      await auth.init()
    } catch (err) {
      showToast('登录状态检查失败，请刷新重试', 'error')
    }
  }

  if (showShell.value) {
    connectSSE()
  }
})

onUnmounted(() => {
  if (sseSource) sseSource.close()
})

async function handleLogout() {
  try {
    await auth.logout()
    if (sseSource) {
      sseSource.close()
      sseSource = null
    }
    router.push('/login')
  } catch (err) {
    showToast('退出登录失败', 'error')
  }
}

function connectSSE() {
  if (sseSource || (auth.enabled && !auth.authenticated)) return

  sseSource = new EventSource('/api/tasks/stream')
  sseSource.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.event === 'init') {
      pendingCount.value = data.tasks.filter(t => ['pending', 'running'].includes(t.status)).length
    } else if (data.event === 'task:created') {
      pendingCount.value++
    } else if (data.event === 'task:updated') {
      const t = data.task
      if (['done', 'failed', 'cancelled'].includes(t.status)) {
        pendingCount.value = Math.max(0, pendingCount.value - 1)
        if (t.status === 'done') showToast('任务完成: ' + t.type, 'success')
        if (t.status === 'failed') showToast('任务失败: ' + (t.error || t.type), 'error')
      }
    }
  }
  sseSource.onerror = () => {
    if (sseSource) sseSource.close()
    sseSource = null
    if (showShell.value) {
      setTimeout(connectSSE, 5000)
    }
  }
}

function showToast(message, type = 'info') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

window.$toast = showToast
</script>

<style>
#app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
}

.app-guest {
  flex: 1;
  width: 100%;
}

.app-loading-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar {
  width: 220px;
  min-width: 220px;
  height: 100vh;
  overflow-y: auto;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  gap: 4px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px 20px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.brand-icon {
  font-size: 20px;
  line-height: 1;
  flex: 0 0 auto;
}

.brand-text-inline {
  white-space: nowrap;
  font-size: 15px;
  line-height: 1.2;
}

.nav-section {
  margin-bottom: 8px;
}

.nav-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 8px 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  position: relative;
}

.nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-item.router-link-active {
  background: var(--accent-dim);
  color: var(--accent);
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-footer {
  margin-top: auto;
  padding: 14px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-user {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-user-label {
  font-size: 11px;
  color: var(--text-muted);
}

.sidebar-logout {
  width: 100%;
  justify-content: center;
}
</style>
