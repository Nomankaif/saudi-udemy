FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter exam-platform-frontend build
EXPOSE 3000
CMD ["pnpm", "--filter", "exam-platform-frontend", "start"]
