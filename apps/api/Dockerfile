FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY configs ./configs
COPY prompts ./prompts
COPY tsconfig.json ./
COPY .env.example ./

RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "dev:api"]
