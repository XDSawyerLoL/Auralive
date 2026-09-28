FROM node:22-slim
ENV NODE_ENV=production \
    AURA_HOST=0.0.0.0
WORKDIR /app
COPY cloud-node/package.json cloud-node/package-lock.json ./
RUN npm ci --omit=dev
COPY cloud-node ./
EXPOSE 10000
CMD ["node", "server.js"]
