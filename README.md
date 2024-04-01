# Binance Bot

## Build image

```
docker build . -t binance-bot
```

## Run image

Port forward: `PC_WEBHOOK_PORT` = `3000` to `3001`
```
docker rm -f binance-bot
docker run --init -dit -p 3000:3001 --name binance-bot binance-bot:latest
```
