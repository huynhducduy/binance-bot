import sendMessage from "./src/utils/telegram/sendMessage";

//----------------------------------------------------------------------------------------------------------------------

const telegramBotKey = process.env.TELEGRAM_PC_BOT_KEY;
const channelChatId = process.env.TELEGRAM_P2PPC_CHAT_ID;
const threshold = 50;

function notify(text) {
  sendMessage(telegramBotKey, channelChatId, text);
}

//----------------------------------------------------------------------------------------------------------------------

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
                "body": `{"page":1,"rows":1,"payTypes":["BANK"],"asset":"${item.asset}","tradeType":"BUY","transAmount":50000000,"fiat":"VND","publisherType":null}`,
                "method": "POST"
            }).then(res => res.json()),
            fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
                "headers": {
                    "cache-control": "no-cache",
                    "content-type": "application/json",
                },
                "body": `{"page":1,"rows":1,"payTypes":["BANK"],"asset":"${item.asset}","tradeType":"SELL","transAmount":50000000,"fiat":"VND","publisherType":null}`,
                "method": "POST"
            }).then(res => res.json()),
        ])
        .then(([res1, res2]) => {
            const [buy, sell] = [res1.data[0].adv.price, res2.data[0].adv.price]
            if (Math.abs(buy-item.lastPrice.buy) >= threshold || Math.abs(sell-item.lastPrice.sell) >= threshold) {
              console.log('USDT Price', buy.toLocaleString("en-US"), sell.toLocaleString("en-US"))
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
