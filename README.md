# Griddy — Grid-Scale AMI Analytics App

An interactive, full-stack application for analyzing electrical distribution grids. Griddy ingests a CIM-based grid model, generates synthetic AMI time-series data, and exposes a rich geospatial dashboard for voltage analysis, phase balancing, load-flow tracing, and alarm correlation.

[Griddy App](https://griddy.peretti.xyz)

---

## Features

- **Interactive Grid Map** — Navigate a 12,000+ node IEEE 8500 distribution model with zoom, pan, and node selection via an inline analytics toolbar.
- **Graph Traversal** — Trace upstream to the source substation or downstream to every affected meter from any selected device.
- **Voltage Distribution** — Statistical breakdown (mean, median, std dev) of voltage readings across any downstream sub-tree over a user-defined time range.
- **Phase Balance Analysis** — Aggregate kWh and instantaneous current across phases A, B, and C to identify neutral loading or phase imbalance.
- **Consumption Time-Series** — Side-by-side kWh (delivered/received) and voltage charts with 1W / 1M / 1Y / custom range filters.
- **Voltage Heatmap** — System-wide geospatial heatmap of voltage health.
- **Alarm Correlation** — Spatially cluster active alarms to identify transformer or feeder outages.
- **Natural Language Queries** — Translate plain-English questions (e.g., *"What was peak load on Phase B last Tuesday?"*) into SQL via a built-in agent.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| Backend | Python · FastAPI · Uvicorn |
| Graph Engine | NetworkX (directed multigraph) |
| Database | DuckDB (relational) · Parquet (time-series) |
| Frontend | React 19 · TypeScript · Vite |
| Visualization | Deck.gl · MapLibre GL · ECharts |
| UI Components | Mantine |
| Containerization | Docker · Docker Compose |
| Documentation | Docusaurus |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- (Optional) Copy `users.csv.example` to `users.csv` in the root directory and update credentials to secure the Rules Engine panel. By default, it uses `admin`/`admin`.

### Run with Docker Compose

```bash
docker compose up --build
```

This command will:

1. Build the **frontend** container (React → Nginx).
2. Build the **backend** container (FastAPI/Uvicorn).
3. Initialize the `grid_data` persistent volume.
4. Auto-ingest all CIM models in the `cim/` directory and generate synthetic AMI readings (controlled by `BOOTSTRAP_DATA`).

Once running, open your browser:

| Service | URL |
| :--- | :--- |
| Web Dashboard | <http://localhost:8080> |
| API (Swagger) | <http://localhost:8000/docs> |
| Documentation | <http://localhost:3002> |

---

## Environment Variables

Customize the deployment using a `.env` file in the project root or by overriding values directly in `docker-compose.yml`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BOOTSTRAP_DATA` | `true` | Ingest the CIM model and generate synthetic readings on startup. |
| `DB_PATH` | `/data/grid_data_cim.duckdb` | Path to the persistent DuckDB file inside the container. |
| `PARQUET_DIR` | `/data/cim_readings` | Directory for Parquet time-series storage. |
| `CIM_MODEL_PATH` | `/app/cim/IEEE8500.xml` | Path to the default CIM source model file. |
| `WEATHER_DATA_PATH` | `/app/cim/weather.epw` | Path to the EPW weather data file. |
| `BACKEND_PORT` | `8000` | Host port for the backend service. |
| `FRONTEND_PORT` | `8080` | Host port for the frontend dashboard. |
| `WEBSITE_PORT` | `3002` | Host port for the documentation site. |

### Manual Data Refresh

To re-run the data ingestion pipeline without rebuilding the entire stack:

```bash
docker compose --profile tools run generator
```

#### Completely Refresh Data (Start Fresh)

To wipe all databases and configurations (recommended if you encounter breaking schema changes during alpha):

> [!IMPORTANT]
> **Best Practice**: Stop all services first using `docker compose down` before running the refresh. This ensures database files are not locked by active processes.

```bash
docker compose down
npm run refresh:data
docker compose up -d
```

---

## Grid Analysis

### Interacting with the Map

- **Zoom & Pan** — Use your mouse or trackpad to navigate the map.
- **Node Selection** — Click any node (Substation, Transformer, Switch, or Meter) to select it. Use **Shift+Click** or **Ctrl+Click** to multi-select.
- **Analytics Toolbar** — When one or more nodes are selected, a floating toolbar appears in the top-right with:
  - **Consumption** (📊) — Open the Consumption Time Series analysis for the selected assets.
  - **Voltage** (📈) — Open the Voltage Distribution analysis for the selected assets.
  - **Date Range** — Click to configure the analysis time window.
  - **Clear** (✕) — Deselect all nodes.
- **Hamburger Menu** (☰) — Access Voltage Map settings, Global Settings, and Documentation.

### Degrees of Separation

Most analyses let you configure **Degrees of Separation**, which controls the depth of the downstream traversal:

| Value | Behavior |
| :--- | :--- |
| `0` | Analyze only the selected node. |
| `5` (default) | Analyze the node and all neighbors up to 5 hops away. |
| Full trace | Traverse the entire downstream tree. |

---

## Local Development

Follow these steps to get a full development environment running with hot-reload on all three services.

### Prerequisites

- **Python 3.12+** and `pip`
- **Node.js 20+** and `npm`

### 1. Generate Sample Data

Before the app can display anything useful you need a DuckDB database and Parquet readings. Run the bootstrap pipeline once from the `backend/` directory:

```bash
cd backend

# Create a virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

# Set required environment variables (adjust paths as needed)
$env:DB_PATH      = "./data/grid_data_cim.duckdb"           # PowerShell
$env:PARQUET_DIR  = "./data/cim_readings"
$env:CIM_MODEL_PATH    = "./cim/IEEE8500.xml"
$env:WEATHER_DATA_PATH = "./cim/weather.epw"
$env:PYTHONPATH   = "."

# Run the data pipeline
mkdir -p data
python scripts/ingest_cim_graph.py
python scripts/ingest_weather.py
python scripts/generate_cim_readings.py
```

> **Tip:** You only need to run data generation once. The database and Parquet files persist in `backend/data/`.

### 2. Start the Backend (FastAPI)

```bash
cd backend
# activate venv if not already active
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API is now live at <http://localhost:8000> with Swagger docs at <http://localhost:8000/docs>.

### 3. Start the Frontend (Vite)

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The dashboard opens at <http://localhost:3001> and proxies `/api` requests to the backend and `/docs` requests to the documentation site.

### 4. Start the Documentation Site (Docusaurus)

In a new terminal:

```bash
cd docs
npm install
npm run start
```

The docs site opens at <http://localhost:3002>.

### Dev Server Summary

| Service | Command | URL |
| :--- | :--- | :--- |
| Backend | `uvicorn main:app --reload` | <http://localhost:8000> |
| Frontend | `npm run dev` (in `frontend/`) | <http://localhost:3001> |
| Docs | `npm run start` (in `docs/`) | <http://localhost:3002> |

> The Vite dev server automatically proxies `/api` → `localhost:8000` and `/docs` → `localhost:3002`, so you can access everything through <http://localhost:3001>.

---

## Project Structure

```
Griddy/
├── backend/              # FastAPI service, graph engine, analytics
│   ├── src/
│   │   ├── agent/        # Natural language → SQL translation
│   │   ├── analytics/    # Voltage, phase balance, consumption use cases
│   │   ├── discovery/    # Upstream/downstream graph traversal
│   │   ├── grid/         # Grid model and data structures
│   │   └── shared/       # DuckDB repository, NetworkX engine
│   ├── scripts/          # Data ingestion and generation scripts
│   ├── cim/              # IEEE 8500 CIM model and weather data
│   └── tests/            # Unit and functional tests
├── frontend/             # React + TypeScript + Vite dashboard
│   └── src/
│       ├── features/     # Grid map and analytics panel components
│       ├── services/     # API client
│       └── shared/       # Types and utilities
├── docs/                 # Docusaurus documentation website
├── docker-compose.yml
├── functional-requirements.md
└── technical-requirements.md
```

---

## Documentation

Full documentation is available at <http://localhost:3002> after starting the stack, and covers:

- [Grid Analysis Guide](docs/docs/analysis-guide/index.md)
- [Voltage Analysis](docs/docs/analysis-guide/voltage-analysis.md)
- [Phase Balance / Load Flow](docs/docs/analysis-guide/load-flow.md)
- [Voltage Map (Heatmap)](docs/docs/analysis-guide/voltage-map.md)
- [Data Generation](docs/docs/data-generation.md)
- [Docker Installation](docs/docs/docker-installation.md)

---

## License

This project is licensed under the [MIT License](LICENSE).
