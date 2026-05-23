# SPSM — SunPower Solar Monitoring Portal

**SPSM** is a self-hosted web portal for monitoring your **SunPower PVS6** system on your local network. It talks directly to the PVS varserver API—no SunPower cloud subscription required for live views and historical charts you store yourself.

> **Disclaimer:** SPSM is an independent hobby project. It is not affiliated with, endorsed by, or supported by SunPower or SunStrong Management.

## Screenshots

### Dashboard

Live stats, energy flow diagram, and power chart (hour → year).

![SPSM dashboard](Screenshots/Dashboard.png)

### Micro-inverters

Per-panel power gauge, temperature, voltage, and lifetime energy.

![SPSM micro-inverters](Screenshots/Inverters.png)

### System health

Rule-based alerts, collapsible check list, and recent alert history.

![SPSM system health](Screenshots/Health.png)

### Energy reports

Daily PV / load / import / export, summary cards, bar chart, year-over-year comparison (when data exists), CSV export, and lowest-output panels.

![SPSM energy reports](Screenshots/Reports.png)

## Features

- **Dashboard** — live solar / home load / grid flow, today’s production and consumption, power charts (hour → year); mobile-friendly layout
- **Energy flow diagram** — animated solar → home → grid (day/night visuals, optional battery path)
- **Micro-inverters** — per-panel power, temperature, voltage, lifetime energy; expandable history charts; optional derating estimate
- **System** — PVS supervisor info, optional raw meter dump
- **Reports** — daily PV / load / grid import & export, CO₂ estimate, estimated bill savings, panel leaderboard, 7/30/90-day ranges (`?days=`), year-over-year comparison, CSV export
- **Settings** — tabbed UI with URL deep links (`?tab=`); **System**, **Notifications**, **Health alerts**, **Accounts**, **Backup**, **Database**; LAN PVS discovery and varserver explorer (admin)
- **Notifications** — master enable plus per-channel toggles for **webhook** (Discord/Slack), **ntfy**, and **SMTP email**; **quiet hours**; test alert using current form values (no save required); optional **monthly report** email
- **Accounts** — admin user management; **read-only** role; **API tokens** for integrations
- **System health** — rule-based alerts with history, **acknowledge** active alerts, optional smart sunrise ramp; optional push on new events (debounced)
- **Mobile shell** — bottom tab bar on phones (Dashboard, Inverters, Reports, Health, More)
- **Background collector** — polls the PVS on a schedule and stores time-series data in PostgreSQL
- **Pre-aggregated rollups** — faster week/month/year charts
- **Prometheus** — `GET /metrics` on the API for external monitoring
- **Setup wizard** — first-run flow when PVS is not configured
- **Help** — in-app guide for every page and Settings tab

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
3. Click **Test connection** (result appears as a toast), then **Save settings**.
4. Optional: **Settings → Notifications** — enable channels, configure webhook / ntfy / SMTP, **Save**, then **Send test notification**.
5. Open the **Dashboard** — live data appears once the collector and PVS connection are working.

### Phone or tablet on your LAN

Use your computer’s LAN address, not `localhost` — e.g. **http://192.168.1.10:5173** (same Wi‑Fi as the Docker host). The UI talks to the API through the Vite proxy on that port, so you do not need `VITE_API_URL=http://localhost:8000` in Docker (that breaks mobile login with “Failed to fetch”). After changing `docker-compose.yml`, run `docker compose up -d --build web api`.

PostgreSQL runs **inside Docker only** (no host port `5432` by default), so it won’t conflict with a local Postgres install. To query from the host, add `"5433:5432"` under `db.ports` in `docker-compose.yml`.

### Rebuild after code changes

See **[Updating an existing install](#updating-an-existing-install)** for the full `git pull` workflow. Quick rebuild:

```bash
docker compose up -d --build
```

For day-to-day dev on a running stack, mounted volumes hot-reload the API and Vite frontend without rebuilding images.

## Updating an existing install

If you already cloned the repo and run SPSM with Docker, updating to the latest code is:

```bash
cd SPSM
git pull
```

1. **Check for new environment variables** — compare `.env.example` with your `.env` and add any new keys (your existing values are kept). Recent examples: `LAN_DNS` (router IP for LAN hostname lookup in Docker), `PORTAL_PUBLIC_URL`, `CORS_ALLOW_PRIVATE_NETWORKS`.
2. **Rebuild and restart** — required when dependencies or Dockerfiles change; safe to run after every pull:

```bash
docker compose up -d --build
```

3. **Confirm services are healthy:**

```bash
docker compose ps
docker compose logs -f api --tail 50
```

Your **database, settings, readings, and users are kept** in the Docker volume (`pgdata`). Pulling and rebuilding does not wipe history unless you remove volumes (`docker compose down -v` — do not use `-v` for a normal update).

**After some upgrades** you may need a one-time rollup backfill (see [Backfill chart rollups](#backfill-chart-rollups)). Watch the repo release notes or commit messages for one-off commands.

**If you changed `docker-compose.yml`** (ports, `LAN_DNS`, CORS, etc.), the same `docker compose up -d --build` applies. Set `LAN_DNS` in `.env` to your router/gateway IP (e.g. `192.168.0.1`) if LAN PVS discovery hostnames do not resolve inside the container.

**If the UI looks stale** after an update, hard-refresh the browser (Ctrl+Shift+R) or reopen the tab. The Vite dev server in the `web` container serves the latest frontend after rebuild.

**If `git pull` reports local changes**, stash or commit your edits first, or reset only files you did not mean to customize:

```bash
git stash
git pull
git stash pop   # optional — restore local edits
```

Custom `.env` is not tracked by git; it is never overwritten by `git pull`.

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
| `site_timezone` | IANA timezone for “today”, reports, and daylight health checks |
| `websocket_live` | SSE live dashboard (polls PVS every 5s) |
| `notify_enabled` | Master switch for health alert notifications |
| `notify_webhook_enabled` + `notify_webhook_url` | Discord/Slack (or any) incoming webhook |
| `notify_ntfy_enabled` + `notify_ntfy_topic` | [ntfy.sh](https://ntfy.sh) topic or full URL |
| `notify_smtp_enabled` + SMTP fields | Email via SMTP with STARTTLS (typical port **587**) |
| `notify_min_severity` | `critical` or `warning` — minimum level that triggers a send |
| `portal_public_url` | Base URL for links in alert and monthly report emails (e.g. `http://192.168.1.50:5173`) — set in **Settings → Notifications** or `PORTAL_PUBLIC_URL` in `.env` |
| `monthly_report_enabled` | Email-only previous-month summary on the **1st** of each month (site timezone); requires SMTP host, from, and to configured |
| `data_retention_enabled` / `data_retention_years` | Optional cap on historical data (1–50 years); auto-purge ~daily when enabled — **Settings → Database** |
| `health_rule_*` | Per-rule enable flags and thresholds — **Settings → Health alerts** |
| `PORTAL_PUBLIC_URL` | Optional env override for email links (same as above; used if UI value is empty) |
| `CORS_ORIGINS` | Allowed browser origins for the API when using a separate API host |
| `CORS_ALLOW_PRIVATE_NETWORKS` | Docker default `true` — allows `192.168.x.x` / `10.x` UI origins (phones on LAN) |
| `LAN_DNS` | Router/gateway IP for LAN DNS inside Docker (e.g. `192.168.0.1`) — used by PVS LAN discovery for hostnames |

Settings are stored in the database and editable from the UI.

#### SMTP example (Mailtrap live)

| Field | Example |
|-------|---------|
| Host | `live.smtp.mailtrap.io` |
| Port | `587` |
| TLS | On (STARTTLS) |
| Username | `api` |
| Password | Your Mailtrap API token |
| From | Verified sender in Mailtrap |
| To | Alert recipient (comma-separated allowed) |

Enable **SMTP email** on the Notifications tab, save, then use **Send test notification**. The server uses **saved** settings for tests and live alerts—not unsaved form values.

#### Monthly report email

On **Settings → Notifications**, the right column has **Monthly report**. You must fill SMTP host, from, and to (same fields as alert email) before the toggle can be turned on. The collector sends one email on the **1st** of each month for the **previous calendar month** (PV, load, grid import/export, CO₂, month-over-month %). Use **Send sample monthly report** to preview after saving SMTP settings. This is independent of the alert **Enable notifications** master switch.

### Database retention and purge

**Settings → Database** (admin only) shows PostgreSQL size, row counts, and oldest/newest readings.

- **Data retention off** (default) — collector history is kept indefinitely.
- **Data retention on** — choose how many years to keep (1–50). Data older than that is deleted from readings, device snapshots, chart rollups, and health events. The collector runs an automatic purge about once per day; use **Purge old data** for an immediate cleanup.
- Settings and portal users are never removed by purge.

### Backup and restore (migration)

**Settings → Backup** (admin only) exports a gzip JSON file with settings, readings, rollups, device snapshots, health history, and user password hashes. Import that file on a new install after signing in once.

Typical migration:

1. On the **old** portal: **Download full backup** and store the `.json.gz` somewhere safe (contains SMTP secrets).
2. Install SPSM on the new host, create your admin account, sign in.
3. **Settings → Backup** → enable **Import settings** and **Import historical data**, leave **Import portal users** off to keep your new login, enable **Replace existing data first**, type `REPLACE`, and choose the backup file.
4. Open **Settings → System** and run **Test connection** if the PVS IP changed on the new network.

Large sites may take a minute to export or import. Maximum upload size is 512 MB.

### Backfill chart rollups

After upgrading, rebuild rollups from existing readings (once):

```bash
docker compose exec api sh -c 'cd /app && PYTHONPATH=. python scripts/backfill_rollups.py'
```

Or from `backend/`: `PYTHONPATH=. python scripts/backfill_rollups.py`

### Home Assistant

Create a long-lived JWT (login via API), then a REST sensor:

```yaml
rest:
  - resource: http://<spsm-host>:8000/api/data/latest
    headers:
      Authorization: "Bearer <token>"
    sensor:
      - name: SPSM PV Power
        value_template: "{{ value_json.pv_kw }}"
        unit_of_measurement: "kW"
```

### Database backup

```bash
docker compose exec db pg_dump -U spsm spsm > spsm-backup.sql
```

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
│   │   ├── notifier.py       # webhook, ntfy, SMTP
│   │   ├── rollup.py         # chart rollups
│   │   └── routers/          # auth, data, reports, settings, health, metrics
│   └── sql/init.sql
├── frontend/
│   └── src/
│       ├── pages/            # Dashboard, Inverters, Reports, Health, System, Settings
│       └── components/       # Charts, energy flow, toggles, toasts
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
| Test notification fails | Enable notifications, turn on a channel, fill its fields, **Save**, then test; check API logs for SMTP errors |
| Reports export always 0 | Requires signed grid net meter deltas; upgrade API if an older build clamped export to zero |
| Port 5432 in use | Postgres is not exposed by default; do not map `5432` unless intentional |

## Roadmap ideas

- Multi-site / multiple PVS hosts in one portal
- MQTT / external integrations beyond API tokens

## Recently added

- Mobile bottom navigation (Dashboard, Inverters, Reports, Health, More)
- Estimated bill savings on Reports (import/export rates in Settings)
- Per-inverter history charts and production leaderboard
- Read-only users and API tokens for integrations
- Test notifications using current form values (no save required)
- Quiet hours, health alert acknowledge, LAN PVS discovery, varserver explorer
- Device snapshot export (Database tab)
- Temperature derating estimate on Inverters (optional)

## License

Provided as-is for personal use. Use at your own risk.

Not affiliated with SunPower or SunStrong Management.
