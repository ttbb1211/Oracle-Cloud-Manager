function maskText(value = '', { start = 6, end = 4 } = {}) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= start + end) return '***'
  return `${text.slice(0, start)}***${text.slice(-end)}`
}

function summarizeConfig(configText = '') {
  const text = String(configText || '')
  if (!text.trim()) return { hasConfig: false, profile: '', region: '' }

  const profileMatch = text.match(/^\[([^\]]+)\]/m)
  const regionMatch = text.match(/^region\s*=\s*(.+)$/m)

  return {
    hasConfig: true,
    profile: profileMatch?.[1]?.trim() || 'DEFAULT',
    region: regionMatch?.[1]?.trim() || ''
  }
}

export function sanitizeAccount(account = {}) {
  const credentials = account.credentials || {}
  const configSummary = summarizeConfig(credentials.configText)
  const privateKeyText = String(credentials.privateKeyText || '')

  return {
    ...account,
    credentials: {
      ...credentials,
      configText: undefined,
      privateKeyText: undefined,
      configSummary,
      hasConfig: configSummary.hasConfig,
      hasPrivateKey: Boolean(privateKeyText.trim()),
      privateKeyPreview: privateKeyText ? maskText(privateKeyText.replace(/\s+/g, ''), { start: 12, end: 8 }) : ''
    }
  }
}

export function sanitizeSettings(settings = {}) {
  const telegram = settings.telegram || {}
  return {
    ...settings,
    telegram: {
      ...telegram,
      botToken: '',
      chatId: telegram.chatId || '',
      hasBotToken: Boolean(String(telegram.botToken || '').trim()),
      botTokenPreview: telegram.botToken ? maskText(telegram.botToken, { start: 10, end: 6 }) : ''
    },
    auth: {
      enabled: settings.auth?.enabled !== false,
      username: settings.auth?.username || 'admin',
      password: ''
    }
  }
}
