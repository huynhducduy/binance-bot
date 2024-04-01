FROM node:20-alpine

# Install pnpm
RUN corepack enable pnpm

#######################################################################

RUN mkdir /app
WORKDIR /app

# NPM will not install any package listed in "devDependencies" when NODE_ENV is set to "production",
# to install all modules: "npm install --production=false".
# Ref: https://docs.npmjs.com/cli/v9/commands/npm-install#description

ENV NODE_ENV production

COPY ./package.json .

RUN pnpm install

COPY . .

LABEL fly_launch_runtime="nodejs"

ENV NODE_ENV production
ENV PATH /root/.volta/bin:$PATH

CMD ["pnpm", "run", "start"]
