# SPSM — SunPower Solar Monitoring Portal

**SPSM** is a self-hosted web portal for monitoring your **SunPower PVS6** system on your local network. It talks directly to the PVS varserver API—no SunPower cloud subscription required for live views and historical charts you store yourself.

> **Disclaimer:** SPSM is an independent hobby project. It is not affiliated with, endorsed by, or supported by SunPower or SunStrong Management.

## Screenshot

![SPSM dashboard — live stats, energy flow, and power chart](Screenshots/Dashboard.png)

## Features

- **Dashboard** — live solar / home load / grid flow, today’s production and consumption, power charts (hour → year)
- **Energy flow diagram** — animated solar → home → grid (day/night visuals, optional battery path)
- **Micro-inverters** — per-panel power, temperature, voltage, lifetime energy
- **System** — PVS supervisor info, optional raw meter dump
- **Settings** — PVS connection, site metadata, collector interval, battery monitoring toggle
- **Accounts** — admin user management (create / edit / delete portal users)
- **System health** — rule-based alerts (PVS offline, stale collector, stuck inverters, overtemperature, production drops, fault flags)
- **Background collector** — polls the PVS on a schedule and stores time-series data in PostgreSQL

Tested with PVS6 firmware **BUILD 61840+** (e.g. 61846). Older firmware may use different varserver paths.

## Architecture

| Component | Role |
|-----------|------|
| **PostgreSQL** | Users, app settings, time-series readings, device snapshots |
| **FastAPI** (`api`) | REST API, JWT auth, settings, chart data |
| **Collector** | Background job — polls PVS varserver on an interval |
| **React** (`web`) | Dark dashboard UI (Vite + Tailwind) |

```
┌─────────┐     HTTPS      ┌──────────┐
│  PVS6   │ ◄───────────── │ collector│
│ (local) │                │    + api │
└─────────┘                └────┬─────┘
                                │
                           ┌────▼────┐
                           │ Postgres │
                           └────┬────┘
                                │
                           ┌────▼────┐
                           │   web   │  ← browser
                           └─────────┘
```

## Requirements

- Docker and Docker Compose
- SunPower PVS6 on the same LAN as the host running SPSM
- PVS reachable on **HTTPS port 443**
- Serial number from the SunPower app (**System Info**)

### PVS authentication

The PVS local API uses HTTP Basic auth:

- **Username:** `ssm_owner`
- **Password:** last **5 characters** of your PVS serial (uppercase)

SPSM derives this automatically from the serial you enter in Settings—you do not type the password separately.

## Quick start

```bash
git clone https://github.com/digitalexpl0it/SPSM.git
cd SPSM
cp .env.example .env
# Edit .env — set a strong SECRET_KEY for production
docker compose up -d --build
```

Open **http://localhost:5173**

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

### First login

1. Sign in (default on a **fresh** database: **`admin` / `admin`** — change this immediately under **Settings → Accounts**).
2. Go to **Settings → System** and enter your PVS **IP or hostname** and **serial number**.
3. Click **Test connection**, then **Save settings**.
4. Open the **Dashboard** — live data appears once the collector and PVS connection are working.

PostgreSQL runs **inside Docker only** (no host port `5432` by default), so it won’t conflict with a local Postgres install. To query from the host, add `"5433:5432"` under `db.ports` in `docker-compose.yml`.

### Rebuild after code changes

```bash
docker compose up -d --build
```

For day-to-day dev, mounted volumes hot-reload the API and Vite frontend without rebuilding images.

## PVS network setup

1. Find the PVS in your router’s DHCP/client list (often named `PVS` or `SunPower`).
2. **Reserve** that IP so it does not change.
3. Confirm the Docker host can reach `https://<PVS_IP>/` on port 443.

Optional terminal check (replace IP and serial):

```bash
PVS_IP=192.168.1.100
SERIAL=ZT223485000000W0000
AUTH=$(echo -n "ssm_owner:${SERIAL: -5}" | base64)
curl -sk -c /tmp/pvs.txt -H "Authorization: Basic $AUTH" "https://$PVS_IP/auth?login"
curl -sk -b /tmp/pvs.txt "https://$PVS_IP/vars?match=livedata&fmt=obj" | head
```

## Configuration

| Setting | Description |
|---------|-------------|
| `SECRET_KEY` | JWT signing key — use `openssl rand -hex 32` in production |
| `poll_interval_seconds` | How often the collector polls the PVS (min 10, default 60) |
| `battery_enabled` | Enable ESS/SunVault telemetry and UI (off for solar-only sites) |
| `collector_enabled` | Turn background polling on or off |

Settings are stored in the database and editable from the UI.

## Data collected

Telemetry is read from the PVS varserver API ([public variable reference](https://github.com/SunStrong-Management/pypvs/blob/main/doc/varserver-variables-public-pvs6.csv)), including:

- **Live:** PV power, home load, grid net, battery SOC/power (if enabled)
- **Inverters:** per-micro-inverter power, heatsink temperature, MPPT, lifetime kWh
- **Meters:** grid import/export (when CTs are installed)
- **ESS / SunVault** (when battery monitoring is enabled)
- **System:** firmware, uptime, resource usage

Historical charts are built from data **SPSM stores**—the PVS does not provide long-term chart history itself.

## Project layout

```
SPSM/
├── backend/
│   ├── app/
│   │   ├── collector.py      # PVS polling loop
│   │   ├── pvs_client.py     # varserver HTTP client
│   │   └── routers/          # auth, data, settings, users
│   └── sql/init.sql
├── frontend/
│   └── src/
│       ├── pages/            # Dashboard, Inverters, System, Settings
│       └── components/       # Charts, energy flow, gauges
├── docker-compose.yml
├── .env.example
└── README.md
```

## Development (without Docker)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://spsm:spsm_dev_change_me@localhost:5432/spsm
uvicorn app.main:app --reload
# Separate terminal:
python -m app.collector
```

**Frontend**

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## Troubleshooting

| Issue | Things to try |
|-------|----------------|
| Dashboard empty / PVS offline | Settings → Test connection; verify IP, serial, and LAN access |
| Docker build fails (registry IPv6) | Set `"ipv6": false` in `~/.docker/daemon.json` and restart Docker |
| No history on charts | Wait for the collector to run; check **collector enabled** and poll interval |
| Port 5432 in use | Postgres is not exposed by default; do not map `5432` unless intentional |

## Roadmap ideas

- Pre-aggregated chart queries for faster year/month views
- Local-time “today” summaries
- Optional notifications (grid export milestones, offline PVS)

## License

Provided as-is for personal use. Use at your own risk.

Not affiliated with SunPower or SunStrong Management.
