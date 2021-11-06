const fs = require('fs');
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

const telegramBotKey = process.env.TELEGRAM_NFTPC_BOT_KEY;
const channelChatId = process.env.TELEGRAM_NFTPC_CHAT_ID;

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

function monitor(e ) {
  console.log(`Started monitoring ${e}`)

  let price = 0.0

  const intervalId = setInterval(() => {
    fetch("https://www.binance.com/bapi/nft/v1/public/nft/market-mystery/mystery-list", {
      "headers": {
        "cache-control": "no-cache",
        "content-type": "application/json",
      },
      "body": "{\"page\":1,\"size\":1,\"params\":{\"keyword\":\""+ e +"\",\"nftType\":null,\"orderBy\":\"amount_sort\",\"orderType\":\"1\",\"serialNo\":null,\"tradeType\":0}}",
      "method": "POST"
    }).then(res => res.json()).then(res => {
      const newPrice = res.data.data[0].amount/res.data.data[0].batchNum
      if (price != newPrice) {
        price = newPrice
        notify(`${e} is now worth ${(price).toFixed(0)}${res.data.data[0].currency}`)
      }
    })
  }, 5000)


  return intervalId
}

// Global variable
let watchList = JSON.parse(fs.readFileSync('./data/nft.json'))

async function onExiting(cmdChatId) {
  notify("<i>Shutting down...</i>")
  await replyTo(cmdChatId, `<i>Shutting down...</i>`)
}

// Start
async function main() {
  await notify("<i>Starting server...</i>")

  watchList = watchList.map(e => ({
    name: e,
    intervalId: monitor(e)
  }));

  await notify("<b>Server started!</b>")

  // Declare a route
  fastify.post('/', async function (request, reply) {
    if (request.body?.message?.text?.startsWith('/add')) {
      const name = request.body.message.text.substring(5)
      const foundAt = watchList.findIndex(e => e === name)

      if (foundAt !== -1) {
          replyTo(request.body.message.chat.id, `${name} is already being monitored`)
      } else {
        watchList.push({ name, intervalId: monitor(name) });
        replyTo(request.body.message.chat.id, `${name} is now being monitored`)
      }
    } else if (request.body?.message?.text?.startsWith('/remove')) {
      const name = request.body.message.text.substring(5)

      const foundAt = watchList.findIndex(e => e.name === name)

      if (foundAt !== -1) {
        clearInterval(watchList[foundAt].intervalId)
        watchList.splice(foundAt, 1)
        replyTo(request.body.message.chat.id, `${name} is no longer being monitored`)
      } else {
        replyTo(request.body.message.chat.id, `${name} is not being monitored`)
      }
    } else if (request.body?.message?.text?.startsWith('/list')) {
      const msg = watchList.map(e => `${e.name}`).join('\n')
      replyTo(request.body.message.chat.id, msg);
    }  else if (request.body?.message?.text?.startsWith('/restart')) {
      onExiting(request.body.message.chat.id);
      spawn( 'sh', ['./restart.sh'] );
    }
    reply.send()
  })

  // Run the server!
  fastify.listen(process.env.NFTPC_WEBHOOK_PORT || 3000, '0.0.0.0', function (err, address) {
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
    fs.writeFileSync('./data/nft.json', JSON.stringify(watchList.map(e => e.name)));
    notify("<b>Server is stopped!</b>").finally(function() {
      process.exit(0)
    })
  }
})
