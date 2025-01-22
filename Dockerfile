FROM node:18-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY . .

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

CMD ["pnpm", "start"]