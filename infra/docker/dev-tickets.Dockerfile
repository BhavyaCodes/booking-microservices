FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/tickets/package.json ./apps/tickets/
COPY packages/common/package.json ./packages/common/

RUN bun install

COPY . .

WORKDIR /app/apps/tickets

CMD ["bun", "run", "dev"]