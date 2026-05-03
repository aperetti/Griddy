# Installation

Griddy can be installed using Docker Compose for a quick setup, or manually for local development.

## Prerequisites

- **Docker Desktop** (for Docker-based setup)
- **Python 3.12+** and **Node.js 20+** (for local development)
- The application will automatically initialize a secure SQLite database on first boot equipped with a default `admin`/`admin` user. User accounts can be further managed inside the Admin Console.

---

## 1. Quick Start with Docker

The easiest way to run the entire stack is with Docker Compose. This command builds the frontend, backend, and documentation containers.

```bash
# From the project root
docker compose up --build
```

Once the containers are running, you can access the services:
- **Web Dashboard**: [http://localhost:8080](http://localhost:8080)
- **Admin Console**: [http://localhost:8091](http://localhost:8091)
- **API Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j Browser**: [http://localhost:7474](http://localhost:7474)
- **Documentation**: [http://localhost:3002](http://localhost:3002)

---

## 2. Local Development with Docker

For active development with hot-reloading enabled across all services, use the development-optimized Docker Compose configuration.

### Prerequisites
- **Docker Desktop** (for Docker-based setup)
- A `.env` file in the project root (copy from `.env.example`)

### Start the Development Stack
Run the following command to start all services (Backend, Frontend, Admin, and Docs) with volume mounting for hot-reloading:

```bash
# Start the full development stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Accessing Services in Development
| Service | URL | Description |
| :--- | :--- | :--- |
| **Main Dashboard** | [http://localhost:8080](http://localhost:8080) | Primary geospatial UI |
| **Admin Console** | [http://localhost:8091](http://localhost:8091) | Configuration and Management |
| **API Swagger** | [http://localhost:8000/docs](http://localhost:8000/docs) | Backend API exploration |
| **Documentation** | [http://localhost:3002](http://localhost:3002) | This documentation site |

### How it Works
The `docker-compose.dev.yml` file overrides the production settings to:
- **Enable Hot-Reload**: Mounts your local source code into the containers as volumes.
- **Development Builds**: Uses specific development targets in the Dockerfiles (e.g., using `npm run dev`).
- **Unified Env**: Reads your local `.env` file for configuration.

---

## 3. Manual Development Setup (Legacy)

If you prefer to run services natively on your host machine without Docker:

### Backend (FastAPI)
1.  Navigate to the `backend/` directory.
2.  Create a virtual environment: `python -m venv .venv`.
3.  Activate it: `.venv\Scripts\activate` (Windows) or `source .venv/bin/activate` (Mac/Linux).
4.  Install dependencies: `pip install -r requirements.txt`.
5.  Start uvicorn: `uvicorn main:app --reload`.

### Frontend (React)
1.  Navigate to the `frontend/` directory.
2.  Install dependencies: `npm install`.
3.  Start the dev server: `npm run dev`.

### Documentation (Docusaurus)
1.  Navigate to the `docs/` directory.
2.  Install dependencies: `npm install`.
3.  Start the dev server: `npm run start`.

## Next Steps
After installing, you will need to generate or ingest your grid data. See the **[Data Setup](./data-setup.md)** guide.
