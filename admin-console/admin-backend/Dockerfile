# Dockerfile for Admin Backend
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# No build script in package.json, we run directly via ts-node
EXPOSE 8090
CMD ["npm", "start"]
