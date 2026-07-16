# Build único: frontend (Vite) + servidor (tsc) -> imagem enxuta Node 22.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build -w web && npm run build -w server && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/data ./server/data
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3030
CMD ["node", "server/dist/index.js"]
