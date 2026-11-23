# syntax=docker/dockerfile:1

# ---- build: compile TypeScript and generate the Prisma client ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled output only ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Name list read at runtime by organization provisioning (src/workforce-plan.ts).
COPY scripts/common_indian_names.json ./scripts/
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
