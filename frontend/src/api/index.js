import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export const authApi = {
  status: () => api.get('/auth/status'),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
}

// ── Compute Accounts ─────────────────────────────────────
export const accountsApi = {
  list:               ()             => api.get('/accounts'),
  create:             (data)         => api.post('/accounts', data),
  update:             (id, data)     => api.put(`/accounts/${id}`, data),
  delete:             (id)           => api.delete(`/accounts/${id}`),
  test:               (id)           => api.post(`/accounts/${id}/test`),
  discoverRegions:    (data)         => api.post('/accounts/oracle/regions/discover', data),
  importRegions:      (data)         => api.post('/accounts/oracle/regions/import', data),
}

// ── Unified Cloud (Compute) ───────────────────────────────
export const cloudApi = {
  listInstances:    (accountId)                  => api.get(`/cloud/${accountId}/instances`),
  getInstance:      (accountId, instanceId)      => api.get(`/cloud/${accountId}/instances/${instanceId}`),
  createInstance:   (accountId, data)            => api.post(`/cloud/${accountId}/instances`, data),
  instanceAction:   (accountId, instanceId, action) =>
                      api.post(`/cloud/${accountId}/instances/${instanceId}/action`, { action }),
  deleteInstance:   (accountId, instanceId)      => api.delete(`/cloud/${accountId}/instances/${instanceId}`),
  switchIp:         (accountId, instanceId, data = {}) =>
                      api.post(`/cloud/${accountId}/instances/${instanceId}/switch-ip`, data),
  addIpv6:          (accountId, instanceId)      => api.post(`/cloud/${accountId}/instances/${instanceId}/add-ipv6`),
  capabilities:     (accountId)                  => api.get(`/cloud/${accountId}/capabilities`),
  modifyShape:      (accountId, instanceId, data) => api.put(`/cloud/${accountId}/instances/${instanceId}/shape`, data),
  allowAllFirewall: (accountId, instanceId)      => api.post(`/cloud/${accountId}/instances/${instanceId}/firewall/allow-all`),
  listVolumes:      (accountId)                  => api.get(`/cloud/${accountId}/volumes`),
  deleteVolume:     (accountId, volumeId)        => api.delete(`/cloud/${accountId}/volumes/${volumeId}`),
}

// ── Tasks ─────────────────────────────────────────────────
export const tasksApi = {
  list:   (params) => api.get('/tasks', { params }),
  cancel: (id)     => api.delete(`/tasks/${id}`),
}

// ── Settings ──────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/settings'),
  updateTelegram: (data) => api.put('/settings/telegram', data),
}

// ── Providers meta ────────────────────────────────────────
export const providersApi = {
  list: () => api.get('/providers'),
}
