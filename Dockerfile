FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY publisher.js routes.json ./

CMD ["node", "publisher.js"]
