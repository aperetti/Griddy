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
- **API Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j Browser**: [http://localhost:7474](http://localhost:7474)
- **Documentation**: [http://localhost:3002](http://localhost:3002)

---

## 2. Local Development Setup

If you need to modify the code and have hot-reloading enabled, follow these steps.

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
