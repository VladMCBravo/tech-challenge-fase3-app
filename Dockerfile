# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# O comando abaixo define a variável fake apenas satisfazendo o Prisma no build
RUN DATABASE_URL="postgresql://user:password@localhost:5432/mydb" npx prisma generate
RUN npm run build

# Stage 2 — runtime
FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# 👇 Copiando a configuração vital do Prisma para a imagem de produção
COPY --from=builder /app/prisma.config.ts ./
USER node
EXPOSE 3000
# 👇 Apenas liga a API (A migração acontece no InitContainer do Kubernetes)
CMD ["node", "dist/src/main.js"]