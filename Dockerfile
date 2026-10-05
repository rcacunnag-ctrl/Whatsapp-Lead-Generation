FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production DATA_DIR=/app/data WA_AUTH_DIR=/app/auth
VOLUME ["/app/data", "/app/auth"]
CMD ["node", "src/index.js"]
