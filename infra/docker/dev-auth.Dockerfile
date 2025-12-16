FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/auth/package.json ./apps/auth/
COPY packages/common/package.json ./packages/common/

RUN bun install

COPY . .

WORKDIR /app/apps/auth

CMD ["bun", "run", "dev"]