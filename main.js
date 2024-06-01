require('dotenv').config()
const fs = require('fs').promises
const crypto = require('crypto')
const TelegramBot = require('node-telegram-bot-api')
const HTMLParser = require('node-html-parser')
const cron = require('node-cron')

const token = process.env.TELEGRAM_BOT_TOKEN
const channel = process.env.TELEGRAM_CHANNEL_ID

if (!token || !channel) {
  console.error('Error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID must be set')
  process.exit(1)
}

const bot = new TelegramBot(token)

const dataPath = './data.json'

/**
 * @typedef {Object} Anime
 * @property {String} title Title
 * @property {String} link Link
 * @property {String} content Content
 * @property {String} image Image URL
 * @property {String} time Time
 */

/**
 * Fetch full anime list data from the website
 * @returns {Promise<Anime[]>} Full anime list data in reverse chronological order
 */
async function fetchAnimeData() {
  const data = []
  const url = 'https://ani.gamer.com.tw/'

  // Wait for 30 seconds to avoid page not updated
  await new Promise((resolve) => setTimeout(resolve, 30000))

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
      },
    })

    if (response.status !== 200) {
      throw new Error(`Status code: ${response.status}`)
    }

    const content = await response.text()
    const root = HTMLParser.parse(content)
    const animeNodeList = root.querySelectorAll('div.newanime-wrap.timeline-ver > div.newanime-block > div.newanime-date-area:not(.premium-block)')

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
    console.error('Error fetching anime data:', error.message)
  }

  return data
}

/**
 * Hash an Object
 * @param {Object} object Object to hash
 * @returns {String} Hashed string
 */
function hash(object) {
  return crypto.createHash('sha256').update(JSON.stringify(object)).digest('hex')
}

/**
 * Check if a file exists
 * @param {String} path File path
 * @returns {Promise<Boolean>} Whether the file exists or not
 */
async function isFileExist(path) {
  try {
    return (await fs.stat(path)).isFile()
  } catch (e) {
    return false
  }
}

/**
 * Check for new anime updates
 * @param {Anime[]} data Full anime list data in reverse chronological order
 * @returns {Promise<Anime[]>} New anime updates in reverse chronological order
 */
async function checkAnimeUpdates(data) {
  const newUpdates = []

  try {
    if (!(await isFileExist(dataPath))) {
      throw new Error('Data file not found')
    }

    const prevData = JSON.parse(await fs.readFile(dataPath, 'utf8'))
    const prevDataHashList = prevData.map((item) => hash(item))

    for (const item of data) {
      if (!prevDataHashList.includes(hash(item))) {
        newUpdates.push(item)
      } else {
        break
      }
    }
  } catch (error) {
    console.error('Error checking new anime updates:', error.message)
  }

  return newUpdates
}

/**
 * Send anime updates in chronological order to the channel
 * @param {Anime[]} updates New anime updates in reverse chronological order
 * @returns {Promise<Anime[]>} Unsent anime updates in reverse chronological order
 */
async function sendAnimeUpdates(updates) {
  let item

  try {
    while (updates.length) {
      item = updates.pop()
      await bot.sendMessage(channel, item.content)
      console.log(`Sent: ${item.content}`)
    }
  } catch (error) {
    updates.push(item) // Put the unsent item back to the list
    throw new Error(`Error sending message to channel: ${error.message}`)
  }

  return updates
}

/**
 * Remove unsent anime updates from the data and save the data to the file
 * @param {Anime[]} data Full anime list data in reverse chronological order
 * @param {Anime[]} unsentUpdates Unsent anime updates in reverse chronological order
 */
async function saveAnimeData(data, unsentUpdates) {
  unsentUpdates.forEach((update) => {
    const index = data.findIndex((item) => hash(item) === hash(update))
    if (index !== -1) {
      data.splice(index, 1)
    }
  })

  if (data.length > 0) {
    await fs.writeFile(dataPath, JSON.stringify(data))
    console.log('Data saved')
  }
}

/**
 * Main scheduling function
 */
async function schedule() {
  console.log('Scheduled at:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))

  try {
    const data = await fetchAnimeData()
    const updates = await checkAnimeUpdates(data)
    const unsentUpdates = await sendAnimeUpdates(updates)
    await saveAnimeData(data, unsentUpdates)
  } catch (error) {
    console.error('Error scheduling:', error.message)
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => process.exit())
process.on('SIGTERM', () => process.exit())

// Update every 15 minutes
cron.schedule('*/15 * * * *', schedule, { runOnInit: true })
