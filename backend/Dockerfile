# Stage 1: Build Plugin UI
FROM node:22-slim AS plugin-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# We need to copy the backend/plugins dir structure so vite can output there
COPY backend/plugins ./backend/plugins
RUN npm run build:plugins

# Stage 2: Final Backend
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    unzip \
    libfreetype6-dev \
    libfontconfig1 \
    fontconfig \
    libxrender1 \
    libxext6 \
    libx11-6 \
    fonts-liberation \
    libcairo2 \
    libcairo2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy pre-compiled plugin UI from stage 1
COPY --from=plugin-builder /build/backend/plugins/ /app/plugins/

# Ensure entrypoint is executable and has LF line endings
RUN sed -i 's/\r$//' docker-entrypoint.sh scripts/bootstrap.sh && chmod +x docker-entrypoint.sh scripts/bootstrap.sh

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8000
ENV DB_PATH=/data/grid_data_cim.duckdb
ENV PARQUET_DIR=/data/cim_readings
ENV CIM_MODEL_PATH=/app/IEEE8500.xml
ENV BOOTSTRAP_DATA=false

# Expose the API port
EXPOSE 8000

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
