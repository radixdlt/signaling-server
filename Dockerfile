FROM oven/bun as base

WORKDIR /app

COPY package.json package.json
COPY bun.lockb bun.lockb

RUN bun install

COPY . .

ENTRYPOINT ["bun", "src/server.ts"]