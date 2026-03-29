FROM node:22-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY lib ./lib

ENV HOST=0.0.0.0
ENV DB_PATH=/data/indexical.db
ENV SPELLFIX1_DLL=/app/lib/spellfix1

EXPOSE 11435

VOLUME /data

ENTRYPOINT ["tini", "--"]
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
