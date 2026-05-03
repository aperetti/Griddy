# Base stage for dependencies
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# Development stage
FROM base AS dev
COPY . .
EXPOSE 3000
CMD ["npx", "docusaurus", "start", "--port", "3000", "--host", "0.0.0.0"]

# Build stage
FROM base AS builder
COPY . .
RUN npm run build

# Final production stage (using busybox httpd)
FROM busybox:1.36 AS prod
WORKDIR /public
COPY --from=builder /app/build ./docs
EXPOSE 3000
CMD ["httpd", "-f", "-p", "3000", "-h", "/public"]
