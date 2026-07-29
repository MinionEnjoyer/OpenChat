FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
ENV DATA_FILE=/data/watches.json
CMD ["node", "index.mjs"]
