const fetch = require('node-fetch');
require('dotenv').config()

const telegramBotKey = process.env.TELEGRAM_NL_BOT_KEY;
const channelChatId = process.env.TELEGRAM_NL_CHAT_ID;

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
