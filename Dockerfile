# build single js file
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# ----------------------------
FROM node:18-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/dist/index.js /app/index.js

CMD ["node", "index.js"]