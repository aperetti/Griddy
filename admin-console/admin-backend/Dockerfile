# Dockerfile for Admin Backend
FROM node:20-alpine
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache unzip

COPY package*.json ./
RUN npm install
COPY . .
# No build script in package.json, we run directly via ts-node
EXPOSE 8090
CMD ["npm", "start"]
