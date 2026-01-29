FROM oven/bun:latest

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/
COPY apps/auth/package.json ./apps/auth/
COPY apps/orders/package.json ./apps/orders/
COPY packages/common/package.json ./packages/common/

RUN bun install

COPY . .

WORKDIR /app/apps/client

CMD ["bun", "run", "dev"]