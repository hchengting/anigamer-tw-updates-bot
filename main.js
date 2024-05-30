require('dotenv').config()
const fs = require('fs').promises
const crypto = require('crypto')
const TelegramBot = require('node-telegram-bot-api')
const HTMLParser = require('node-html-parser')
const cron = require('node-cron')

const token = process.env.TELEGRAM_BOT_TOKEN
const channel = process.env.TELEGRAM_CHANNEL_ID
const bot = new TelegramBot(token)

const dataPath = './data.json'

function hash(item) {
  return crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex')
}

async function checkNewUpdates(data) {
  try {
    const prevData = JSON.parse(await fs.readFile(dataPath, 'utf8'))
    const prevDataHashList = prevData.map((item) => hash(item))
    return data.filter((item) => !prevDataHashList.includes(hash(item)))
  } catch (error) {
    console.error('Error reading or hashing previous data:', error)
    return []
  }
}

async function sendUpdates(updates) {
  updates.reverse()
  for (const item of updates) {
    try {
      await bot.sendMessage(channel, item.content)
      console.log(`Sent: ${item.content}`)
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }
}

async function fetchData(scheduled) {
  if (scheduled) {
    // Wait 30 seconds before fetch
    await new Promise((resolve) => setTimeout(resolve, 30000))
  }

  const data = []
  const url = 'https://ani.gamer.com.tw/'

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
      },
    })

    if (response.status !== 200) {
      throw new Error(`Status code: ${response.status}`)
    }

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
  } catch (error) {
    console.error('Error fetching data:', error)
  }

  return data
}

async function main(scheduled) {
  console.log(scheduled ? 'Scheduled at:' : 'Started at:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))

  try {
    const data = await fetchData(scheduled)

    if (scheduled) {
      const updates = await checkNewUpdates(data)
      await sendUpdates(updates)
    }

    if (data.length !== 0) {
      await fs.writeFile(dataPath, JSON.stringify(data))
    }
  } catch (error) {
    console.error('Error in main function:', error)
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Bot is shutting down...')
  process.exit()
})

process.on('SIGTERM', () => {
  console.log('Bot is shutting down...')
  process.exit()
})

console.log(token, channel)

// Update every 15 minutes
cron.schedule('*/15 * * * *', () => main(true))
main(false)
