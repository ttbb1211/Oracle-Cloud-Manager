import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Accounts from '../views/Accounts.vue'
import Settings from '../views/Settings.vue'

const routes = [
  { path: '/', component: Dashboard, meta: { title: 'Dashboard' } },
  { path: '/accounts', component: Accounts, meta: { title: 'Accounts' } },
  { path: '/cloud', component: () => import('../views/CloudInstances.vue'), meta: { title: 'Cloud Instances' } },
  { path: '/settings', component: Settings, meta: { title: 'Settings' } }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
