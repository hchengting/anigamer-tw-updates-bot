require('dotenv').config()
const fs = require('fs')
const crypto = require('crypto')
const TelegramBot = require('node-telegram-bot-api')
const HTMLParser = require('node-html-parser')
const cron = require('node-cron')

const token = process.env.TELEGRAM_BOT_TOKEN
const channel = process.env.TELEGRAM_CHANNEL_ID
const bot = new TelegramBot(token)

const dataPath = './data.json'

async function hash(message) {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function checkNewUpdates(data) {
  const prevData = fs.readFileSync(dataPath, 'utf-8')
  const prevDataHashList = await Promise.all(JSON.parse(prevData).map((d) => hash(JSON.stringify(d))))

  const newUpdates = []
  for (const item of data) {
    const hashValue = await hash(JSON.stringify(item))
    if (!prevDataHashList.includes(hashValue)) {
      newUpdates.push(item)
    }
  }

  return newUpdates
}

async function sendUpdates(updates) {
  updates.reverse()
  for (const item of updates) {
    await bot.sendMessage(channel, item.content)
    console.log(`Sent: ${item.content}`)
  }
}

async function fetchData(scheduled) {
  if (scheduled) {
    // Wait 30 seconds before fetch
    await new Promise((resolve) => setTimeout(resolve, 30000))
  }

  const data = []
  const url = 'https://ani.gamer.com.tw/'

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
    },
  })

  if (response.status !== 200) return

  const content = await response.text()

  const root = HTMLParser.parse(content)
  const animeNodeList = root.querySelectorAll(
    'div.newanime-wrap.timeline-ver > div.newanime-block > div.newanime-date-area:not(.premium-block)'
  )

  animeNodeList.forEach((animeNode) => {
    const title = `${animeNode.querySelector('div.anime-name > p').text}`
    const link = `${url}${animeNode.querySelector('a.anime-card-block').getAttribute('href')}`
    const episode = animeNode.querySelector('div.anime-episode > p').text.match(/\d+/)[0]
    const content = `【更新通知】${title} [${episode}]\n${link}`
    const image = animeNode.querySelector('div.anime-blocker > img').getAttribute('data-src')
    const mmdd = animeNode.querySelector('span.anime-date-info').text.match(/\b(\d{2})\/(\d{2})\b/)[0]
    const hhmm = animeNode.querySelector('span.anime-hours').text
    const time = `${mmdd} ${hhmm}`

    data.push({
      title,
      link,
      content,
      image,
      time,
    })
  })

  return data
}

async function main(scheduled) {
  console.log(scheduled ? 'Scheduled at:' : 'Started at:', new Date().toLocaleString())

  try {
    const data = await fetchData(scheduled)

    if (scheduled) {
      const updates = await checkNewUpdates(data)
      await sendUpdates(updates)
    }

    fs.writeFileSync(dataPath, JSON.stringify(data))
  } catch (error) {
    console.error(error)
  }
}

// update every 15 minutes
cron.schedule('*/15 * * * *', () => main(true))
main(false)
console.log(token, channel)
