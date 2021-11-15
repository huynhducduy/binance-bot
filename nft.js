const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const fastify = require('fastify')({
  // https: {
  //   key: fs.readFileSync(path.join(__dirname, '..', 'secure', 'key.pem')),
  //   cert: fs.readFileSync(path.join(__dirname, '..', 'secure', 'cert.pem'))
  // }
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

function convertSource(sourceNum) {
  switch (sourceNum) {
    case 0:
      return "Binance Mystery Boxes"
    case 1:
      return "Binance Marketplace"
    case 2:
      return "Raca Marketplace"
    case 3:
      return "Opensea"
    default:
      throw new Error("Unknown source: " + sourceNum);
  }
}

function monitor({name, source, category, keyword} ) {

  let price = 0.0

  let intervalId;

  switch (source) {
    case 0:
        intervalId = setInterval(() => {
          fetch("https://www.binance.com/bapi/nft/v1/public/nft/market-mystery/mystery-list", {
            "headers": {
              "cache-control": "no-cache",
              "content-type": "application/json",
            },
            "body": "{\"page\":1,\"size\":1,\"params\":{\"keyword\":\""+ keyword +"\",\"nftType\":null,\"orderBy\":\"amount_sort\",\"orderType\":1,\"serialNo\":"+ (category ? `["${category}"]` : "null")  +",\"tradeType\":0}}",
            "method": "POST"
          }).then(res => res.json()).then(res => {
            const newPrice = res.data.data[0].amount/res.data.data[0].batchNum
            if (price != newPrice) {
              price = newPrice
              notify(`<b>${name}</b> is now worth <b><a href='https://www.binance.com/en/nft/goods/blindBox/detail?productId=${res.data.data[0].productId}&isProduct=1'>${(price).toFixed(2)}${res.data.data[0].currency}</a></b>`)
            }
          })
        }, 1000)
      break;
    case 2:
        intervalId = setInterval(() => {
          fetch(`https://market-api.radiocaca.com/nft-sales?pageNo=1&pageSize=1&sortBy=fixed_price&name=${keyword}&order=asc&saleType&category=${category}&tokenType`)
          .then(res => res.json()).then(res => {
            const newPrice = res.list[0].fixed_price/res.list[0].count
            if (price != newPrice) {
              price = newPrice
              notify(`<b>${name}</b> is now worth <b><a href='https://market.radiocaca.com/#/market-place/${res.list[0].id}'>${(price).toFixed(0)}RACA</a></b>`)
            }
          })
        }, 1000)
  }

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
    ...e,
    intervalId: monitor(e)
  }));

  await notify("<b>Server started!</b>")

  fastify.post('/', async function (request, reply) {
    const message = request.body?.message;
    if (message) {
        const regex = /\/(?<command>add|remove)\s(?<source>\d+)\s?(?<category>\d*)\s?"(?<keyword>.*)"\s<(?<name>.*)>/gm;

        if (regex.test(message.text)) {
          regex.lastIndex = 0
          let m;

          while ((m = regex.exec(message.text)) !== null) {
              if (m.index === regex.lastIndex) {
                  regex.lastIndex++;
              }

              const name = m.groups.name;
              const keyword = m.groups.keyword;
              const source = m.groups.source;
              const category = m.groups.category;
              const command = m.groups.command;

              const foundAt = watchList.findIndex(e => e.name === name)
              if (foundAt !== -1) {
                  if (command === "add") {
                    replyTo(message.chat.id, `${name} is already being monitored`)
                  } else if (command === "remove") {
                    clearInterval(watchList[foundAt].intervalId)
                    watchList.splice(foundAt, 1)
                    replyTo(message.chat.id, `${name} is no longer being monitored`)
                  }
              } else {
                if (command === "add") {
                  watchList.push({ name, source, category, keyword, intervalId: monitor({name, source, category, keyword}) });
                  replyTo(message.chat.id, `${name} is now being monitored`)
                } else if (command === "remove") {
                  replyTo(message.chat.id, `${name} is not being monitored`)
                }
              }
          }
        } else if (message.text?.startsWith('/list')) {
          const msg = watchList.map(e => `${e.name} on ${convertSource(e.source)}`).join('\n')
          replyTo(message.chat.id, msg);
        }  else if (message.text?.startsWith('/restart')) {
          onExiting(message.chat.id);
          spawn( 'sh', ['./restart.sh'] );
        }
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
    fs.writeFileSync('./data/nft.json', JSON.stringify(watchList.map(e => ({...e, intervalId: undefined}))));
    notify("<b>Server is stopped!</b>").finally(function() {
      process.exit(0)
    })
  }
})
