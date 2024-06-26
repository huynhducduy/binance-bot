import path from 'path'
import { createSendMessage } from './src/utils/telegram/sendMessage'
import logError from './src/utils/logError'

//----------------------------------------------------------------------------------------------------------------------

const key = Bun.file(path.join(__dirname, '..', 'secure', 'key.pem'))
const cert = Bun.file(path.join(__dirname, '..', 'secure', 'cert.pem'))

const https = (await key.exists()) && (await cert.exists()) ? {
    key: key.textSync(),
    cert: cert.textSync(),
  } : undefined

const fastify = require('fastify')({
  https: https
})

process.send = process.send || function () {};

const telegramBotKey = process.env.TELEGRAM_PC_BOT_KEY;
const channelChatId = process.env.TELEGRAM_PC_CHAT_ID;

const replyTo = createSendMessage(telegramBotKey)

const notify = (text) => replyTo(channelChatId, text)

//----------------------------------------------------------------------------------------------------------------------

let socket = null

let id = 1
const price = {}
const messsagesToSend = []
let watchList = JSON.parse(await Bun.file('./data/watcher.json').text())

function processMessage(streamName, data) {
  if (data && data.p) {
    price[streamName] = parseFloat(data.p)
  }
}

function connect() {
  return new Promise((resolve) => {
    socket = new WebSocket(`wss://stream.binance.com:9443/stream`)

    socket.onopen = () => {
      socket.onmessage = raw => {
        try {
          const message = JSON.parse(raw.data)
          if (message) {
            const streamName = message.stream
            const data = message.data
            processMessage(streamName, data)
          }
        } catch (e) {
          logError('parse message', e)
        }
      }

      socket.onerror = function(err) {
        logError('socket', err);
      }

      socket.onclose = function (err) {
        logError('close', err);
      }

      resolve()
    }
  })
}

function monitor(e = 'BTC', threshold = 1) {
  console.log(`Started monitoring ${e} at a threshold ${threshold}`)
  id++

  const prices = []
  let diffs = 0.0
  let combo = 0

  let streamName = e.toLowerCase() + "usdt@aggTrade"

  const thisId = id;

  messsagesToSend.push({
    id: id,
    method: 'SUBSCRIBE',
    params: [streamName]
  })

  // Add latest price to list of prices
  const watcher1 = setInterval(() => {
    if (prices.length > 10) {
      prices.push(price[streamName])
      prices.shift()
    } else {
      prices.push(price[streamName])
    }
    console.log('PRICE(' + streamName +')', price[streamName])
  }, 1000)

  // Calculate diff
  const watcher2 = setInterval(() => {
    if (prices.length < 10) {
      return
    }

    const diff = ((prices[9] / prices[0]) - 1)
    diffs += diff
  }, 1000)

  // Notify user
  const watcher3 = setInterval(() => {
    if (prices.length < 10) {
      return
    }

    // Big change
    if (diffs > (threshold / 10) || diffs < -(threshold / 10)) {
      // Send notify
      const positive = `+${threshold}%`
      const negative = `-${threshold}%`
      const msg = `${e} has just modified ${diffs > 0 ? positive : negative}, current price is ${price[streamName]}`
      combo += diffs > 0 ? 1 : -1

      notify(msg)
      if (combo >= 3) {
        const comboMsg = `<b>${e} is having a bull-run!</b>`
        notify(comboMsg)
        combo = 0
      }
      if (combo <= -3) {
        const comboMsg = `<b>${e} is crashing!</b>`
        notify(comboMsg)
        combo = 0
      }
      diffs = 0
    }
  }, 1000)

  function stopWatchers() {
    messsagesToSend.push({
      id: thisId,
      method: 'UNSUBSCRIBE',
      params: [streamName]
    })
    clearInterval(watcher1)
    clearInterval(watcher2)
    clearInterval(watcher3)
  }

  return { stopWatchers }
}

async function onExiting(cmdChatId) {
  notify("<i>Shutting down...</i>")
  await replyTo(cmdChatId, "<i>Shutting down...</i>")
}

// Start
async function main() {
  await notify("<i>Starting server...</i>")
  await connect()
  await notify("<b>Server started!</b>")

  setInterval(() => {
    const messsageToSend = messsagesToSend.shift()
    if (messsageToSend) socket.send(JSON.stringify(messsageToSend))
  }, 1000)

  watchList = watchList.map(e => ({
    ...e,
    stopper: monitor(e.name, e.threshold)
  }));

  // Declare a route
  fastify.post('/', async function (request, reply) {
    if (request.body?.message?.text?.startsWith('/add')) {
      const [, name, threshold] = request.body.message.text.split(' ')
      if (!threshold || threshold <= 0) {
        replyTo(request.body.message.chat.id, "Threshold must be positive")
        reply.send()
        return;
      }

      const foundAt = watchList.findIndex(e => e.name === name)

      if (foundAt !== -1) {
        if (watchList[foundAt].threshold !== parseFloat(threshold)) {
          watchList[foundAt].stopper.stopWatchers()
          watchList[foundAt].threshold = parseFloat(threshold)
          watchList[foundAt].stopper = monitor(name, threshold)
          replyTo(request.body.message.chat.id, `${name} is now being monitored at a threshold of ${threshold}`)
        } else {
          replyTo(request.body.message.chat.id, `${name} is already being monitored at a threshold of ${threshold}`)
        }
      } else {
        watchList.push({ name, threshold: parseFloat(threshold), stopper: monitor(name, parseFloat(threshold)) });
        replyTo(request.body.message.chat.id, `${name} is now being monitored at a threshold of ${threshold}`)
      }
    } else if (request.body?.message?.text?.startsWith('/remove')) {
      const [, name] = request.body.message.text.split(' ')

      const foundAt = watchList.findIndex(e => e.name === name)

      if (foundAt !== -1) {
        watchList[foundAt].stopper.stopWatchers()
        watchList.splice(foundAt, 1)
        replyTo(request.body.message.chat.id, `${name} is no longer being monitored`)
      } else {
        replyTo(request.body.message.chat.id, `${name} is not being monitored`)
      }
    } else if (request.body?.message?.text?.startsWith('/list')) {
      const msg = watchList.map(e => `${e.name} is being monitored at a threshold of ${e.threshold}`).join('\n')
      replyTo(request.body.message.chat.id, msg);
    }
    // else if (request.body?.message?.text?.startsWith('/restart')) {
    //   onExiting(request.body.message.chat.id);
    //   spawn( 'sh', ['./restart.sh'] );
    // }
    reply.send()
  })

  // Run the server!
  fastify.listen(process.env.PC_WEBHOOK_PORT || 3000, '0.0.0.0', function (err, address) {
    if (err) {
      logError('????', err)
      fastify.log.error(err)
      process.exit(1)
    }
    fastify.log.info(`server listening on ${address}`)
    process.send('ready')
  })
}

main()

let cleanedUp = false;

process.on('SIGINT', function() {
  if (!cleanedUp) {
    cleanedUp = true;
    (async function() {
      await Bun.write('./data/watcher.json', JSON.stringify(watchList.map(e => ({
        name: e.name,
        threshold: e.threshold,
      }))));
      notify("<b>Server is stopped!</b>").finally(function() {
        process.exit(0)
      })
    })();
  }
})
