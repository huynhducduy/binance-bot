import logError from "../logError";

export default function sendMessage(botKey, chatId, text) {
  return fetch(`https://api.telegram.org/bot${botKey}/sendMessage`, {
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
  }).catch(e => logError('reply', e));
}

export function createSendMessage(botKey) {
  return (chatId, text) => sendMessage(botKey, chatId, text);
}
