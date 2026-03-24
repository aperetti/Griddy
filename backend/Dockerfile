FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libfreetype6-dev \
    libfontconfig1 \
    fontconfig \
    libxrender1 \
    libxext6 \
    libx11-6 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy the CIM model from the parent directory if it's there (orchestrated by compose/build context)
# Alternatively, we expect it to be in /app/IEEE8500.xml

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
