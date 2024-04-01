# Binance Bot

## Build image

```sh
docker build . -t binance-bot
```

## Run image

Port forward: `PC_WEBHOOK_PORT` = `3000` to `3001`

```sh
docker rm -f binance-bot
docker run --init -dit -p 3000:3001 --name binance-bot binance-bot:latest
```

Stop

```sh
docker kill binance-bot
```

## Deploy on Fly.io

Make sure `internal_port` match

```sh
fly deploy && fly scale count 1
```

## Config Telegram Bot

Deploy the bot with the supported port on ipv4: `443`, `80`, `88`, `8443`; Add a domain name;
Add `149.154.160.0/20` and `91.108.4.0/22` to accepted incoming subnet
Add SSL/TLS support
Make a POST request to `https://api.telegram.org/bot<token>/setWebhook`

```js
async function setWebhook(token, url = "") {
  // Default options are marked with *
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url
    }),
  });
  return response.json();
}
```
