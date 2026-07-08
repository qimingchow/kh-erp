FROM node:20-alpine

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev
COPY collector.js /app/collector.js

ENV NODE_ENV=production
CMD ["node", "/app/collector.js"]
