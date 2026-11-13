FROM docker.io/library/node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json build.mjs ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM docker.io/library/nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/public/ /usr/share/nginx/html/
EXPOSE 80