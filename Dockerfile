FROM oven/bun:alpine

#######################################################################

RUN mkdir /app
WORKDIR /app

ENV NODE_ENV production

COPY ./package.json .

RUN bun install --production --frozen-lockfile

COPY . .

LABEL fly_launch_runtime="bun"

CMD ["bun", "run", "start"]
