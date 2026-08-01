# Build context = ./apps/web
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
# Git honors the deploy service's restrictive umask when it materializes a release checkout.
# Vite preserves public-asset modes, so without normalization Nginx's unprivileged worker can
# serve generated bundles but returns 403 for copied PNG/HTML assets created as root:root 0640.
RUN chmod -R a+rX /usr/share/nginx/html \
    && test -z "$(find /usr/share/nginx/html -type f ! -perm -004 -print -quit)"
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
