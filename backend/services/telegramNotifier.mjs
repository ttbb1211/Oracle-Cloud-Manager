import TelegramBot from 'node-telegram-bot-api'
import { queueEmitter } from '../queue.mjs'
import { accountsDb, settingsDb } from '../db.mjs'

let botInstance = null
let currentToken = null

function getTelegramConfig() {
  const telegram = settingsDb.data?.telegram || {}
  return {
    botToken: telegram.botToken?.trim(),
    chatId: telegram.chatId?.trim()
  }
}

function getBot(botToken) {
  if (!botToken) return null

  if (!botInstance || currentToken !== botToken) {
    botInstance = new TelegramBot(botToken, { polling: false })
    currentToken = botToken
  }

  return botInstance
}

function getAccountName(accountId) {
  if (!accountId) return '-'
  const account = accountsDb.data.accounts.find(item => item.id === accountId)
  return account?.name || accountId
}

function formatTaskMessage(task) {
  const statusLabel = task.status === 'done' ? 'DONE' : 'CANCELLED'
  const lines = [
    `Task ${statusLabel}`,
    `Type: ${task.type}`,
    `Account: ${getAccountName(task.accountId)}`,
    `Status: ${task.status}`
  ]

  if (task.statusMessage) lines.push(`Message: ${task.statusMessage}`)
  if (task.result?.instanceId) lines.push(`Instance: ${task.result.instanceId}`)
  if (task.error) lines.push(`Error: ${task.error}`)

  return lines.join('\n')
}

async function sendMessage(text) {
  const { botToken, chatId } = getTelegramConfig()
  if (!botToken || !chatId) {
    throw new Error('请先填写 Telegram Bot Token 和 Chat ID')
  }

  const bot = getBot(botToken)
  if (!bot) {
    throw new Error('Telegram Bot 初始化失败')
  }

  await bot.sendMessage(chatId, text)
}

async function sendTaskNotification(task) {
  await sendMessage(formatTaskMessage(task))
}

export async function sendTelegramTestMessage() {
  const text = [
    '✅ Oracle 管理面板 Telegram 通知测试成功',
    `Time: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '如果你收到了这条消息，说明 Bot Token 与 Chat ID 都可用。'
  ].join('\n')

  await sendMessage(text)
}

queueEmitter.on('task:finalized', async ({ task }) => {
  try {
    await sendTaskNotification(task)
  } catch (err) {
    console.error('Telegram notification failed:', err.message)
  }
})
