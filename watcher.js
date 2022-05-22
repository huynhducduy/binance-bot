const fs = require('fs');
const WebSocket = require('ws')
const fetch = require('node-fetch');
const path = require('path');
const fastify = require('fastify')({
  https: {
    key: fs.readFileSync(path.join(__dirname, '..', 'secure', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '..', 'secure', 'cert.pem'))
  }
})
const { spawn } = require( 'child_process' );
require('dotenv').config()
process.send = process.send || function () {};

const telegramBotKey = process.env.TELEGRAM_PC_BOT_KEY;
const channelChatId = process.env.TELEGRAM_PC_CHAT_ID;

const uri = `https://api.telegram.org/bot${telegramBotKey}`;

function logError(e) {
  console.error("ERROR: " + e.toString());
}

function notify(text) {
  return fetch(`${uri}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: channelChatId,
      text: text,
      parse_mode: "html",
      disable_web_page_preview: true,
    })
  }).catch(e => logError(e));
}

function replyTo(chatId, text) {
  return fetch(`${uri}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "html",
      disable_web_page_preview: true,
    })
  }).catch(e => logError(e));
}

function monitor(e = 'BTC', threshold = 1) {
  console.log(`Started monitoring ${e} at a threshold ${threshold}`)

  let price = 0.0
  const prices = []
  let diffs = 0.0
  let combo = 0

  let socket = null

  let connectStr = e.toLowerCase()
  if (connectStr.includes('busd')) {
    connectStr += `@aggTrade`
  } else {
    connectStr += `usdt@aggTrade`
  }
  function connect() {
    socket = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + connectStr)

    socket.on('message', raw => {
      const data = JSON.parse(raw).data
      price = parseFloat(data.p)
    })

    socket.onerror = function(err) {
      logError(err);
    }

    socket.onclose = function (err) {
      logError(err);
      setTimeout(() => connect(), 0)
    }
  }

  connect()

  const watcher1 = setInterval(() => {
    if (prices.length > 10) {
      prices.push(price)
      prices.shift()
    } else {
      prices.push(price)
    }
  }, 1000)

  const watcher2 = setInterval(() => {
    if (prices.length < 10) {
      return
    }

    const diff = ((prices[9] / prices[0]) - 1)
    diffs += diff
  }, 1000)

  // Watcher
  const watcher3 = setInterval(() => {
    if (prices.length < 10) {
      return
    }

    // Big change
    if (diffs > (threshold / 10) || diffs < -(threshold / 10)) {
      // Send notify
      const positive = `+${threshold}%`
      const negative = `-${threshold}%`
      const msg = `${e} has just modified ${diffs > 0 ? positive : negative}, current price is ${price}`
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
    clearInterval(watcher1)
    clearInterval(watcher2)
    clearInterval(watcher3)
    socket.onclose = null
    socket.terminate()
  }

  return { stopWatchers }
}

// Global variable
let watchList = JSON.parse(fs.readFileSync('./data/watcher.json'))

async function onExiting(cmdChatId) {
  notify("<i>Shutting down...</i>")
  await replyTo(cmdChatId, `<i>Shutting down...</i>`)
}

// Start
async function main() {
  await notify("<i>Starting server...</i>")

  watchList = watchList.map(e => ({
    ...e,
    stopper: monitor(e.name, e.threshold)
  }));

  await notify("<b>Server started!</b>")

  // Declare a route
  fastify.post('/', async function (request, reply) {
    if (request.body?.message?.text?.startsWith('/add')) {
      const [, name, threshold] = request.body.message.text.split(' ')
      if (!threshold || threshold <= 0) {
        replyTo(request.body.message.chat.id, `Threshold must be positive`)
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
    }  else if (request.body?.message?.text?.startsWith('/restart')) {
      onExiting(request.body.message.chat.id);
      spawn( 'sh', ['./restart.sh'] );
    }
    reply.send()
  })

  // Run the server!
  fastify.listen(process.env.PC_WEBHOOK_PORT || 3000, '0.0.0.0', function (err, address) {
    if (err) {
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
    fs.writeFileSync('./data/watcher.json', JSON.stringify(watchList.map(e => ({
      name: e.name,
      threshold: e.threshold,
    }))));
    notify("<b>Server is stopped!</b>").finally(function() {
      process.exit(0)
    })
  }
})
