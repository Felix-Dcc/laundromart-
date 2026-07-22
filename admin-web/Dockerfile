# Admin dashboard — build the Vite SPA, then serve it statically.
# Stage 1: build. VITE_API_URL is read from .env.production at build time.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the static bundle. `serve -s` sends every route to index.html,
# which BrowserRouter (client-side routing) requires.
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
# Cache policy: never stale-cache index.html (so new deploys show immediately);
# cache the content-hashed assets forever. `serve` reads dist/serve.json.
COPY serve.json ./dist/serve.json
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
