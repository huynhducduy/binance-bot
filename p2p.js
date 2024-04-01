require('dotenv').config()
process.send = process.send || function () {};

const telegramBotKey = process.env.TELEGRAM_PC_BOT_KEY;
const channelChatId = process.env.TELEGRAM_P2PPC_CHAT_ID;
const threshold = 50;

const uri = `https://api.telegram.org/bot${telegramBotKey}`;

function logError(e) {
  console.error(`ERROR: ${e.toString()}`);
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

const fetch = require('node-fetch');

const data = [{
  asset: 'USDT',
  lastPrice: {
    buy: 0,
    sell: 0,
  },
}]

function getBuySellPrice() {
    data.forEach(async (item) => {
        Promise.all([
            fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
                "headers": {
                    "cache-control": "no-cache",
                    "content-type": "application/json",
                },
                "body": `{"page":1,"rows":1,"payTypes":["BANK"],"asset":"${item.asset}","tradeType":"BUY","tradeAmount":50000000,"fiat":"VND","publisherType":null}`,
                "method": "POST"
            }).then(res => res.json()),
            fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
                "headers": {
                    "cache-control": "no-cache",
                    "content-type": "application/json",
                },
                "body": `{"page":1,"rows":1,"payTypes":["BANK"],"asset":"${item.asset}","tradeType":"SELL","tradeAmount":50000000,"fiat":"VND","publisherType":null}`,
                "method": "POST"
            }).then(res => res.json()),
        ])
        .then(([res1, res2]) => {
            const [buy, sell] = [res1.data[0].adv.price, res2.data[0].adv.price]
            if (Math.abs(buy-item.lastPrice.buy) >= threshold || Math.abs(sell-item.lastPrice.sell) >= threshold) {
              notify(`BUY <b>${buy.toLocaleString("en-US")}</b>, SELL <b>${sell.toLocaleString("en-US")}</b> at <b><a href='https://p2p.binance.com/trade/BANK/USDT?fiat=VND'>Binance</a></b>`)
              item.lastPrice = {
                buy: buy,
                sell: sell,
              }
            }
        })
    })
}

getBuySellPrice()

setInterval(() => {
  getBuySellPrice()
}, 60 * 1000) // 1 minute
