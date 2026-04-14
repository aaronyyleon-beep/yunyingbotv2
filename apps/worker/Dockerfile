FROM mcr.microsoft.com/playwright:v1.58.0-jammy

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY configs ./configs
COPY prompts ./prompts
COPY tsconfig.json ./
COPY .env.example ./

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "dev:worker"]
