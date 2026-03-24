import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Accounts from '../views/Accounts.vue'
import Settings from '../views/Settings.vue'
import Login from '../views/Login.vue'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/login', component: Login, meta: { title: 'Login', guestOnly: true } },
  { path: '/', component: Dashboard, meta: { title: 'Dashboard', requiresAuth: true } },
  { path: '/accounts', component: Accounts, meta: { title: 'Accounts', requiresAuth: true } },
  { path: '/cloud', component: () => import('../views/CloudInstances.vue'), meta: { title: 'Cloud Instances', requiresAuth: true } },
  { path: '/settings', component: Settings, meta: { title: 'Settings', requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    try {
      await auth.init()
    } catch (err) {
      auth.initialized = true
      auth.enabled = true
      auth.authenticated = false
    }
  }

  if (to.meta.requiresAuth && auth.enabled && !auth.authenticated) {
    return '/login'
  }

  if (to.meta.guestOnly && (!auth.enabled || auth.authenticated)) {
    return '/'
  }

  return true
})

export default router
