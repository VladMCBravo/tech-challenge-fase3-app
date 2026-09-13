# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Define uma URL fake só para o Prisma gerar o client durante o build
RUN DATABASE_URL="postgresql://user:password@localhost:5432/mydb" npx prisma generate
RUN npm run build

# Stage 2 — runtime
FROM node:22-alpine AS runner
WORKDIR /app
# openssl/libc6-compat: o engine de migration do Prisma precisa deles no Alpine
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
# ANTES: npm ci --omit=dev  -> removia o "prisma" (CLI), quebrando o "prisma migrate deploy"
# AGORA: instala tudo, porque o initContainer roda a migration usando a CLI do Prisma.
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# prisma.config.ts é necessário para a CLI saber como conectar no banco (Prisma 7)
COPY --from=builder /app/prisma.config.ts ./
USER node
EXPOSE 3000
# A API só sobe; a migration acontece no initContainer do Kubernetes
CMD ["node", "dist/src/main.js"]