FROM node:24-slim

RUN mkdir -p /home/node/sporttech.io/api-ext/node_modules && chown -R node:node /home/node/sporttech.io/api-ext

WORKDIR /home/node/sporttech.io/api-ext

COPY --chown=node:node package*.json ./

USER node

RUN npm install

COPY --chown=node:node . .

CMD ["node", "index.js"]

