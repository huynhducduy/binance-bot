const WebSocket = require('ws')
const fetch = require('node-fetch');
require('dotenv').config()

const telegramBotKey = process.env.TELEGRAM_AT_BOT_KEY;
const channelChatId = process.env.TELEGRAM_AT_CHAT_ID;

const uri = `https://api.telegram.org/bot${telegramBotKey}`;

function logError(e) {
  console.log("ERROR: " + e.toString());
}

function notify(text) {
  fetch(`${uri}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: channelChatId,
      text: text,
      parse_mode: "html",
    })
  }).catch(e => logError(e));
}

//----------------------------------------------------------------------------------------------------------------------

let socket = null;

const pumpCheck = {};
const pumpThreshold = 2

function getPrice(symbol) {
  return new Promise((resolve, reject) => {
    fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
      .then(response => response.json())
      .then(data => {
        resolve(Number(data.price).toString());
      })
      .catch(err => {
        logError(err);
        reject(err);
      });
  })
}

function monitorAbnormalTradingNotices() {
  socket = new WebSocket('wss://bstream.binance.com:9443/stream?streams=abnormaltradingnotices');

  socket.on('message', async raw => {
    const data = JSON.parse(raw).data;
    data.baseAsset = data.baseAsset.toUpperCase()

    if (data.baseAsset.endsWith('UP') || data.baseAsset.endsWith('DOWN')) return;
    if (data.quotaAsset !== "USDT") return;

    const changeInPercentage = (data.priceChange > 0 ? "+" : "") + (data.priceChange * 100).toFixed(2) + "%";

    let periodStr = '';

    switch (data.period) {
      case 'MINUTE_5':
        periodStr = '5 minutes'
        break;
      case 'HOUR_2':
        periodStr = '2 hours'
        break;
      case 'DAY_1':
        periodStr = '1 day'
        break;
      case 'WEEK_1':
        periodStr = '1 week'
        break;
      case 'MONTH_1':
        periodStr = '1 month'
        break;
      default:
        periodStr = data.period;
    }

    if (['MINUTE_5', 'HOUR_2'].includes(data.period)) {
      if (pumpCheck[data.baseAsset] === undefined || pumpCheck[data.baseAsset] <= 0) {
        pumpCheck[data.baseAsset] = 0;
      }

      let message = `${data.baseAsset}'s price`;

      if (data.eventType === "UP_1") {
        if (data.period === "MINUTE_5") {
          pumpCheck[data.baseAsset] += 1;

          if (pumpCheck[data.baseAsset] >= pumpThreshold) {
            notify(`<b>${message} is being pumped!</b>`)
          }
        }

        message += ` INCREASED`;
      } else if (data.eventType === "DOWN_1") {
        if (data.period === "MINUTE_5") {
          pumpCheck[data.baseAsset] -= 1;
        }
        message += ` DECREASED`;
      }

      let price = 0;
      try {
        price = await getPrice(data.symbol);
      } catch (err) {
        price = "not available"
        logError(err)
      }

      message += ` ${changeInPercentage} within ${periodStr}. Current price is ${price}.`;
      notify(message)
    } else {
      let message = `${data.baseAsset}`;

      if (['RISE_AGAIN','DROP_BACK'].includes(data.eventType)) {
        if (data.eventType === 'RISE_AGAIN') {
          message += ` is rising again`
        } else if (data.eventType === 'DROP_BACK') {
          message += ` is dropping back`
        }

        message += ` (${changeInPercentage} in ${periodStr}).`

        let price = 0;
        try {
          price = await getPrice(data.symbol);
        } catch (err) {
          price = "not available"
          logError(err)
        }

        message += ` Current price is ${price}.`;
        notify(message);

      } else if (['UP_BREAKTHROUGH', 'DOWN_BREAKTHROUGH'].includes(data.eventType)) {

        let stateStr = data.eventType === 'UP_BREAKTHROUGH' ? 'HIGH' : 'LOW';

        message += ` have a new ${periodStr} ${stateStr} (${changeInPercentage}).`;

        let price = 0;
        try {
          price = await getPrice(data.symbol);
        } catch (err) {
          price = "not available"
          logError(err)
        }

        message += ` Current price is ${price}.`;

        notify(message);
      }
    }
  })

  socket.onerror = function(e) {
    logError(e);
  }

  socket.onclose = function (e) {
    logError(e);
    setTimeout(() => monitorAbnormalTradingNotices(), 0)
  }
}

monitorAbnormalTradingNotices();


// Pull-back, Rally, new xxx high, new xxx low, in 5 min, in 2 hours

// const dataSet = {
//   noticeType: 'PRICE_CHANGE', // PRICE_FLUCTUATION, PRICE_BREAKTHROUGH
//   eventType: 'UP_1', // DOWN_1, DROP_BACK (Pullback), RISE_AGAIN (Rally), UP_BREAKTHROUGH (new high), DOWN_BREAKTHROUGH (new low)
//   period: 'MINUTE_5', // HOUR_2, DAY_1, WEEK_1, MONTH_1, YEAR_1
//   priceChange: 0.03530751,
//   baseAsset: 'FARM',
//   quotaAsset: 'BTC'
// }

