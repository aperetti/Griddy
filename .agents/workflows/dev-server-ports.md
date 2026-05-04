---
description: Development server ports and URLs for the Griddy project
---

# Development Server Ports

> **IMPORTANT: Always use these ports when testing or opening the application in a browser.**

## Docker Compose (Primary — Production-like)

All services run as Docker containers via `docker-compose.yml`.

| Service              | Port   | URL                       | Container Name       |
|----------------------|--------|---------------------------|----------------------|
| **Frontend**         | `8080` | http://localhost:8080      | `grid-frontend`      |
| **Backend API**      | `8000` | http://localhost:8000/api  | `grid-backend`       |
| **Docs**             | `3002` | http://localhost:3002      | `grid-docs`          |
| **Admin Frontend**   | `8091` | http://localhost:8091      | `grid-admin-frontend` |
| **Admin Backend**    | `8090` | http://localhost:8090      | `grid-admin-backend` |
| **Grafana**          | `3000` | http://localhost:3000      | `grid-grafana`       |
| **Neo4j Browser**    | `7474` | http://localhost:7474      | `grid-neo4j`         |
| **Neo4j Bolt**       | `7687` | bolt://localhost:7687      | `grid-neo4j`         |
| **Loki**             | `3100` | http://localhost:3100      | `grid-loki`          |
| **Tempo**            | `3200` | http://localhost:3200      | `grid-tempo`         |
| **MongoDB**          | `27017`| mongodb://localhost:27017  | `grid-mongodb`       |

## Start Commands

| Mode   | Service  | Command                      | Working Directory |
|--------|----------|------------------------------|-------------------|
| Docker | All      | `docker compose up -d`       | project root      |

## Common Mistakes

- **Do NOT confuse ports 3002 (docs) and 8080 (frontend)** — they are separate services.
