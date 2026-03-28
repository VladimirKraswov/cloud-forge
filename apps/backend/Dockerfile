FROM node:20-slim AS builder

WORKDIR /app

# Using root-level package.json for workspaces if needed, but here we can just build the backend
COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Optional: if worker assets are provided during build, they can be included.
# But for a cleaner separation, we can mount them or download them.
# The code now supports WORKER_ASSETS_PATH.
# By default, we expect them in /app/worker if we want them inside the image.
# COPY worker/runner.py ./worker/runner.py
# COPY worker/sdk ./worker/sdk

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.js"]
