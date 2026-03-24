import { defineStore } from 'pinia'
import { authApi } from '../api/index.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    initialized: false,
    enabled: true,
    authenticated: false,
    user: null,
    hint: null,
  }),
  actions: {
    async init() {
      const { data } = await authApi.status()
      this.enabled = data.enabled
      this.authenticated = data.authenticated
      this.user = data.user || null
      this.hint = data.hint || null
      this.initialized = true
      return data
    },
    async logout() {
      await authApi.logout()
      this.authenticated = false
      this.user = null
    },
  },
})
