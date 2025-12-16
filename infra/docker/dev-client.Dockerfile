FROM oven/bun:latest

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/

RUN bun install

COPY . .

WORKDIR /app/apps/client

CMD ["bun", "run", "dev"]