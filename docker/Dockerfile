# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar dependências primeiro (cache layer)
COPY package.json package-lock.json* bun.lock* bun.lockb* ./
RUN npm install --legacy-peer-deps --ignore-scripts 2>/dev/null || npm install --legacy-peer-deps

# Copiar código fonte
COPY . .

# Variáveis de ambiente para o build do Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Build de produção
RUN npm run build

# ── Stage 2: Serve com Nginx ──
FROM nginx:1.27-alpine AS production

# Remover config padrão
RUN rm -f /etc/nginx/conf.d/default.conf

# Copiar config customizada
COPY docker/nginx.conf /etc/nginx/conf.d/simplynvest.conf

# Copiar arquivos estáticos do build
COPY --from=builder /app/dist /usr/share/nginx/html

# Instalar curl para healthcheck
RUN apk add --no-cache curl

# Container escuta na porta 80 (internamente)
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
