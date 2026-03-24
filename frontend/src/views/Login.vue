<template>
  <div class="login-page">
    <section class="login-intro glass-card">
      <div class="login-brand">CLOUD MANAGER</div>
      <h1>登录云管理平台</h1>
      <p>统一管理 Oracle、AWS、DNS 与任务队列的云资源管理平台。</p>

      <div class="login-defaults" v-if="hint">
        <div class="login-default-card">
          <span>默认账号</span>
          <strong>{{ hint.defaultUsername }}</strong>
        </div>
        <div class="login-default-card">
          <span>默认密码</span>
          <strong>{{ hint.defaultPassword }}</strong>
        </div>
      </div>
    </section>

    <section class="login-form-panel glass-card">
      <h2>账户登录</h2>
      <form @submit.prevent="submitLogin">
        <div class="form-group login-form-group">
          <label>用户名</label>
          <input v-model.trim="form.username" class="form-control login-input" autocomplete="username" />
        </div>

        <div class="form-group login-form-group">
          <label>密码</label>
          <input
            v-model="form.password"
            type="password"
            class="form-control login-input"
            autocomplete="current-password"
          />
        </div>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button class="btn btn-primary login-submit" type="submit" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '../api/index.js'

const props = defineProps({
  hint: {
    type: Object,
    default: null,
  },
})

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({
  username: props.hint?.defaultUsername || '',
  password: props.hint?.defaultPassword || '',
})

async function submitLogin() {
  loading.value = true
  error.value = ''
  try {
    await authApi.login({ ...form })
    router.push('/')
  } catch (err) {
    error.value = err?.response?.data?.error || '登录失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>
