FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/orders/package.json ./apps/orders/
COPY packages/common/package.json ./packages/common/

RUN bun install

COPY . .

WORKDIR /app/apps/orders

CMD ["bun", "run", "dev"]