require('dotenv').config()
const fs = require('fs').promises
const crypto = require('crypto')
const TelegramBot = require('node-telegram-bot-api')
const HTMLParser = require('node-html-parser')
const cron = require('node-cron')

const token = process.env.TELEGRAM_BOT_TOKEN
const channel = process.env.TELEGRAM_CHANNEL_ID

if (!token || !channel) {
  console.error('[ERROR]: TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID must be set')
  process.exit(1)
}

const bot = new TelegramBot(token)

const filePath = './animes.json'

/**
 * @typedef {Object} Anime
 * @property {String} title Title
 * @property {String} link Link
 * @property {String} content Content
 * @property {String} image Image URL
 * @property {String} time Time
 */

/**
 * Fetch full anime list from the website
 * @returns {Promise<Anime[]>} Full anime list in reverse chronological order
 */
async function fetchAnimes() {
  const animes = []
  const url = 'https://ani.gamer.com.tw/'

  // Wait 30 seconds in case the anime list is not updated
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

      animes.push({
        title,
        link,
        content,
        image,
        time,
      })
    })
  } catch (error) {
    console.error('[ERROR][fetchAnimes]:', error.message)
  }

  return animes
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
 * Compare with the previous anime list and check for updates
 * @param {Anime[]} animes Full anime list in reverse chronological order
 * @returns {Promise<Anime[]>} Anime updates in reverse chronological order
 */
async function checkAnimeUpdates(animes) {
  const updates = []

  try {
    if (!(await isFileExist(filePath))) {
      throw new Error(`File not found: ${filePath}`)
    }

    const prevAnimes = JSON.parse(await fs.readFile(filePath, 'utf8'))
    const prevAnimesHashList = prevAnimes.map((anime) => hash(anime))

    for (const anime of animes) {
      if (!prevAnimesHashList.includes(hash(anime))) {
        updates.push(anime)
      } else {
        break
      }
    }
  } catch (error) {
    console.error('[ERROR][checkAnimeUpdates]:', error.message)
  }

  return updates
}

/**
 * Send anime updates in chronological order to the channel
 * @param {Anime[]} updates Anime updates in reverse chronological order
 * @returns {Promise<Anime[]>} Unsent anime updates in reverse chronological order
 */
async function sendAnimeUpdates(updates) {
  let anime

  try {
    while (updates.length) {
      anime = updates.pop()
      await bot.sendMessage(channel, anime.content)
      console.log('[LOG] Sent:', anime.content)
    }
  } catch (error) {
    updates.push(anime) // Put the unsent anime back to the list
    console.error('[ERROR][sendAnimeUpdates]:', error.message)
  }

  return updates
}

/**
 * Save anime list to a file, excluding unsent updates
 * @param {Anime[]} animes Full anime list in reverse chronological order
 * @param {Anime[]} unsentUpdates Unsent anime updates in reverse chronological order
 */
async function saveAnimes(animes, unsentUpdates) {
  unsentUpdates.forEach((update) => {
    const index = animes.findIndex((anime) => hash(anime) === hash(update))
    if (index !== -1) {
      animes.splice(index, 1)
    }
  })

  if (animes.length > 0) {
    await fs.writeFile(filePath, JSON.stringify(animes))
    console.log('[LOG] Saved to file:', filePath)
  }
}

/**
 * Main scheduling function
 */
async function schedule() {
  console.log('[LOG] Scheduled at:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))

  try {
    const animes = await fetchAnimes()
    const updates = await checkAnimeUpdates(animes)
    const unsentUpdates = await sendAnimeUpdates(updates)
    await saveAnimes(animes, unsentUpdates)
  } catch (error) {
    console.error('[ERROR][schedule]:', error.message)
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => process.exit())
process.on('SIGTERM', () => process.exit())

// Update every 15 minutes
cron.schedule('*/15 * * * *', schedule, { runOnInit: true })
