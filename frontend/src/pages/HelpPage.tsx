import { Link } from "react-router-dom";
import {
  Archive,
  BarChart3,
  Bell,
  CircleHelp,
  Database,
  HeartPulse,
  Home,
  Settings,
  Sun,
  UserCircle,
  Wrench,
  Zap,
} from "lucide-react";

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Home;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card-glow p-6 scroll-mt-6 space-y-3">
      <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
        <Icon className="w-5 h-5 shrink-0" />
        {title}
      </h2>
      <div className="text-sm text-mist space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-cyan-glow/90">{title}</h3>
      {children}
    </div>
  );
}

const TOC = [
  { id: "mobile", label: "Mobile navigation" },
  { id: "start", label: "Getting started" },
  { id: "dashboard", label: "Dashboard" },
  { id: "inverters", label: "Inverters" },
  { id: "reports", label: "Reports" },
  { id: "health", label: "Health" },
  { id: "system", label: "System" },
  { id: "settings", label: "Settings overview" },
  { id: "settings-system", label: "→ System tab" },
  { id: "settings-notifications", label: "→ Notifications tab" },
  { id: "settings-health", label: "→ Health alerts tab" },
  { id: "settings-accounts", label: "→ Accounts tab" },
  { id: "settings-backup", label: "→ Backup tab" },
  { id: "settings-database", label: "→ Database tab" },
  { id: "tips", label: "Tips & troubleshooting" },
] as const;

export function HelpPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
          <CircleHelp className="w-8 h-8" />
          Help
        </h1>
        <p className="text-sm text-mist mt-2">
          How to use SPSM — the self-hosted SunPower PVS6 monitoring portal. Settings are saved in
          the database; the background collector polls your PVS on a schedule you choose.
        </p>
      </header>

      <nav className="card-glow p-4" aria-label="On this page">
        <p className="text-xs font-medium text-mist mb-2">On this page</p>
        <ul className="text-sm space-y-1 columns-1 sm:columns-2 gap-x-6">
          {TOC.map(({ id, label }) => (
            <li key={id}>
              <a href={`#${id}`} className="text-cyan-glow hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="mobile" title="Mobile navigation" icon={Home}>
        <p>
          On phones and small tablets, SPSM uses a <strong className="text-cyan-glow/90">bottom tab bar</strong>{" "}
          instead of the desktop sidebar:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Dashboard</strong>, <strong>Inverters</strong>, <strong>Reports</strong>, and{" "}
            <strong>Health</strong> — primary tabs.
          </li>
          <li>
            <strong>More</strong> — System, Settings, Help, and Sign out.
          </li>
        </ul>
        <p>
          Open the portal at{" "}
          <span className="mono text-cyan-glow/80">http://&lt;server-lan-ip&gt;:5173</span> from
          your phone (not <span className="mono">localhost</span>). Content has extra bottom padding
          so the tab bar does not cover charts or buttons.
        </p>
      </Section>

      <Section id="start" title="Getting started" icon={Home}>
        <p>
          After install, open the portal in your browser and sign in. On a fresh database the first
          account is created at login; a default <span className="mono text-cyan-glow/80">admin</span>{" "}
          user may exist — change that password under{" "}
          <Link to="/settings" className="text-cyan-glow hover:underline">
            Settings → Accounts
          </Link>
          .
        </p>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            <strong className="text-cyan-glow/90">Connect the PVS</strong> —{" "}
            <Link to="/settings" className="text-cyan-glow hover:underline">
              Settings → System
            </Link>
            : enter the PVS IP or hostname and serial number from the SunPower app (System Info).
            Use <strong>Test connection</strong>, then <strong>Save settings</strong>.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Wait for data</strong> — the collector runs in the
            background. The{" "}
            <Link to="/" className="text-cyan-glow hover:underline">
              Dashboard
            </Link>{" "}
            fills in once readings are stored (usually within one poll interval).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Optional</strong> — notifications, monthly email
            reports, timezone, and display options are all under Settings.
          </li>
        </ol>
        <p>
          The PVS uses HTTP Basic auth with username <span className="mono">ssm_owner</span> and
          password equal to the <strong>last five characters</strong> of your serial (uppercase).
          SPSM builds that from the serial you enter — you do not type the password separately.
        </p>
      </Section>

      <Section id="dashboard" title="Dashboard" icon={Home}>
        <p>
          Your main live view: current solar production, home load, and grid flow, plus today&apos;s
          energy totals in your site timezone.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-cyan-glow/90">Energy flow diagram</strong> — animated paths for
            solar → home → grid (and battery if enabled in settings).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Stat cards</strong> — today&apos;s PV, load, import,
            export, and related totals from stored readings.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Power chart</strong> — switch ranges (hour through
            year). Longer ranges use pre-aggregated rollups for speed.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Live mode</strong> — when enabled in Settings, the
            dashboard can stream fresher PVS data over SSE (more frequent updates, more load on the
            PVS).
          </li>
        </ul>
        <p>
          If numbers stay at zero, confirm Settings → System (PVS connected), that the collector is
          enabled, and that the PVS is producing or has recent livedata.
        </p>
      </Section>

      <Section id="inverters" title="Inverters" icon={Sun}>
        <p>Per micro-inverter detail from the latest device snapshot pulled from the PVS.</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Power gauge, temperature, AC voltage, and lifetime energy per panel.</li>
          <li>
            Gauge full-scale can be automatic (from module type) or a fixed max wattage in Settings
            → System.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Show history</strong> — expand a panel for a
            day/week/month power chart from stored snapshots.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Derating estimate</strong> — optional expected vs
            actual power when enabled under Settings → System (uses heatsink temp and coefficient).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Refresh from PVS</strong> — forces a new pull
            instead of only showing cached snapshot data; stale data is indicated when the snapshot
            is old.
          </li>
        </ul>
        <p>
          Temperature alerts on the Health page use the warning/critical thresholds configured under
          Settings → System.
        </p>
      </Section>

      <Section id="reports" title="Reports" icon={BarChart3}>
        <p>
          Historical energy built from collector readings — not live PVS totals. Uses your site
          timezone for calendar days.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-cyan-glow/90">Range buttons</strong> — 7, 30, or 90 days (URL
            deep link: <span className="mono">/reports?days=30</span>).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Summary cards</strong> — period totals and
            estimated CO₂ offset (factor from Settings).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Estimated savings</strong> — uses your net
            billing plan (NEM 1.0/2.0 retail credit vs NEM 3.0 lower export rate) and $/kWh rates
            from Settings → System.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Top producers</strong> — ranked panel energy for
            the selected period (from stored inverter snapshots).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Chart</strong> — daily bars for solar, load,
            import, and export.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Year-over-year</strong> — comparison block appears
            when data exists from the same period one year ago.
          </li>
          <li>
            <strong className="text-cyan-glow/90">CSV</strong> — download daily rows for the selected
            range.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Lowest output</strong> — snapshot of weakest
            panels right now (from latest inverter data).
          </li>
        </ul>
        <p>
          Import/export on the chart uses signed net meter deltas. If the page is empty, check that
          the collector has been running; use Health and Dashboard to confirm connectivity.
        </p>
      </Section>

      <Section id="health" title="Health" icon={HeartPulse}>
        <p>
          Rule-based checks against live PVS data, stored readings, and snapshots. Alerts are
          informational — always verify on the hardware when something looks wrong.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-cyan-glow/90">Severity</strong> — info, warning, and critical;
            expand the list to see each check and detail text.
          </li>
          <li>
            <strong className="text-cyan-glow/90">History</strong> — past alert transitions stored in
            the database (subject to data retention if enabled). Open directly with{" "}
            <span className="mono">/health?history=1</span>.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Acknowledge</strong> — pause repeat notifications
            for an active alert until it resolves (write access required).
          </li>
          <li>
            <strong className="text-cyan-glow/90">Notifications</strong> — new warning/critical events
            can push to webhook, ntfy, or email when configured under Settings → Notifications
            (debounced; optional quiet hours).
          </li>
        </ul>
        <p>
          Some checks respect site timezone and daylight (e.g. production expectations during
          daytime only).
        </p>
      </Section>

      <Section id="system" title="System" icon={Zap}>
        <p>PVS supervisor and equipment metadata from cached device snapshots.</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Supervisor / gateway information when available from the PVS.</li>
          <li>Optional raw meter dump for debugging varserver fields.</li>
          <li>Use this page to confirm the portal can read system-level variables from your install.</li>
        </ul>
      </Section>

      <Section id="settings" title="Settings overview" icon={Settings}>
        <p>
          Settings are organized into tabs. Deep links work:{" "}
          <span className="mono text-cyan-glow/80">/settings?tab=notifications</span>,{" "}
          <span className="mono">?tab=health</span>, <span className="mono">?tab=accounts</span>, etc.
          Most changes apply after you click <strong className="text-cyan-glow/90">Save settings</strong>{" "}
          on that tab (or the dedicated save button on Database / Health rules). Read-only accounts
          can view but not save.
        </p>
        <p>
          <strong className="text-cyan-glow/90">Test alert email</strong> on the Notifications tab
          uses the current form values — you do not need to save first. Monthly report test still
          uses saved SMTP settings.
        </p>
        <p>
          The background <strong className="text-cyan-glow/90">collector</strong> reads settings
          each cycle: if the collector is disabled or PVS host/serial is missing, polling stops and
          charts/reports will not grow.
        </p>
        <p className="text-xs">
          First-time setup may show a short wizard on the Settings route until PVS host and serial
          are saved.
        </p>
      </Section>

      <section id="settings-system" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          Settings — System tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <Sub title="PVS connection">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>IP or hostname</strong> — LAN address of the PVS (HTTPS port 443).
              </li>
              <li>
                <strong>Serial number</strong> — from SunPower System Info; used for auth and
                varserver paths.
              </li>
              <li>
                <strong>Verify SSL</strong> — turn on only if your PVS has a trusted certificate;
                most home installs leave this off.
              </li>
              <li>
                <strong>Test connection</strong> — validates reachability before save.
              </li>
            </ul>
          </Sub>
          <Sub title="Site & collector">
            <ul className="list-disc list-inside space-y-1">
              <li>Site name, ID, and address — labels for your own reference.</li>
              <li>
                <strong>Poll interval</strong> — seconds between collector polls (minimum 10).
              </li>
              <li>
                <strong>Collector enabled</strong> — master switch for background polling.
              </li>
              <li>
                <strong>Site timezone</strong> — defines “today”, reports, and some health checks.
              </li>
              <li>
                <strong>Live dashboard (WebSocket/SSE)</strong> — optional 5-second live stream on the
                dashboard.
              </li>
            </ul>
          </Sub>
          <Sub title="Battery">
            <p>
              Enable only if you have SunVault / ESS telemetry. Adds battery path on the dashboard
              and extra snapshot category.
            </p>
          </Sub>
          <Sub title="Inverter gauges & temperature">
            <ul className="list-disc list-inside space-y-1">
              <li>Auto max watts per gauge, or a fixed cap for all panels.</li>
              <li>Temperature unit (°F / °C) and warning/critical heatsink thresholds for health.</li>
            </ul>
          </Sub>
          <Sub title="Analytics">
            <p>
              CO₂ factor (kg per kWh), net billing plan (NEM 1.0/2.0/3.0 or custom), electricity
              import/export rates ($/kWh) for savings on Reports, temperature coefficient, and
              optional derating display on Inverters.
            </p>
          </Sub>
          <Sub title="Debug tab (admin)">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Scan local subnet</strong> — on the System tab, in the PVS connection card
                (manual; may take a minute).
              </li>
              <li>
                <strong>Varserver explorer</strong> — live key/value read from the PVS with filter
                and copy.
              </li>
            </ul>
          </Sub>
        </div>
      </section>

      <section id="settings-notifications" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Settings — Notifications tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <p>Two columns: alert notifications (left) and monthly report email (right).</p>
          <Sub title="Alert notifications">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Enable notifications</strong> — master switch for health alert delivery.
              </li>
              <li>
                <strong>Portal URL</strong> — link target in emails (use your LAN URL, not
                localhost, if you open the portal from phones).
              </li>
              <li>
                <strong>Webhook</strong> — Discord/Slack incoming webhook URL.
              </li>
              <li>
                <strong>ntfy</strong> — topic name or full ntfy URL.
              </li>
              <li>
                <strong>SMTP email</strong> — host, port, TLS, credentials, from/to addresses (e.g.
                Mailtrap live SMTP on port 587).
              </li>
              <li>
                <strong>Minimum severity</strong> — only send warning and/or critical transitions at
                or above the level you pick.
              </li>
              <li>
                <strong>Quiet hours</strong> — pause delivery during a daily window (site timezone);
                critical alerts can still be allowed.
              </li>
              <li>
                <strong>Send test alert email</strong> — uses the values on this page (no save
                required).
              </li>
            </ul>
          </Sub>
          <Sub title="Monthly report">
            <ul className="list-disc list-inside space-y-1">
              <li>Email-only summary of the previous calendar month.</li>
              <li>Requires SMTP host, from, and to — same fields as alert email.</li>
              <li>Sent automatically on the 1st of each month (site timezone).</li>
              <li>Independent of the alert master switch.</li>
              <li>
                <strong>Send sample monthly report</strong> — preview after saving SMTP.
              </li>
            </ul>
          </Sub>
        </div>
      </section>

      <section id="settings-health" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <HeartPulse className="w-5 h-5" />
          Settings — Health alerts tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <p>
            <strong>Admin only.</strong> Configure which checks run on the Health page and can
            trigger notifications (when notifications are enabled on the Notifications tab).
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Enable or disable each rule (PVS offline, stale data, daylight zero PV, etc.).</li>
            <li>
              Tune thresholds where available — e.g. minutes below zero PV, production drop %,
              stale reading gap.
            </li>
            <li>
              <strong>Smart sunrise ramp</strong> — optional season-aware morning ramp for the
              daylight zero-PV check (off = fixed 3-hour ramp after 6 AM local).
            </li>
            <li>
              Temperature alerts use thresholds from the System tab; turn the temperature rule off
              here if you only want other checks.
            </li>
            <li>
              Click <strong>Save health rules</strong> — separate from notification channel
              settings.
            </li>
          </ul>
        </div>
      </section>

      <section id="settings-accounts" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <UserCircle className="w-5 h-5" />
          Settings — Accounts tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <p>
            <strong>Admin only.</strong> Create, edit, or delete portal users. Each user signs in
            with a username and password stored as a secure hash — passwords are never shown after
            creation.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>At least one admin must remain; you cannot delete your own account or the only admin.</li>
            <li>
              <strong>Read-only users</strong> — can view dashboards but cannot save settings or
              run write actions.
            </li>
            <li>
              <strong>API tokens</strong> — create revocable <span className="mono">spsm_…</span>{" "}
              tokens for scripts and integrations (Bearer auth on API requests).
            </li>
            <li>Use strong passwords on any install exposed beyond your LAN.</li>
          </ul>
        </div>
      </section>

      <section id="settings-backup" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <Archive className="w-5 h-5" />
          Settings — Backup tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <p>
            <strong>Admin only.</strong> Export or import a gzip JSON backup for moving to a new
            server.
          </p>
          <Sub title="Export">
            <p>
              Downloads settings, readings, rollups, device snapshots, health history, and user
              password hashes. Treat the file as secret (SMTP passwords and PVS config inside).
            </p>
          </Sub>
          <Sub title="Import (typical migration)">
            <ol className="list-decimal list-inside space-y-1">
              <li>Install SPSM on the new host and create an admin login.</li>
              <li>Enable import settings + historical data; leave import users off to keep your new login.</li>
              <li>Enable replace existing, type REPLACE, choose the backup file.</li>
              <li>Re-test PVS connection if the IP changed.</li>
            </ol>
          </Sub>
        </div>
      </section>

      <section id="settings-database" className="card-glow p-6 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-cyan-glow flex items-center gap-2">
          <Database className="w-5 h-5" />
          Settings — Database tab
        </h2>
        <div className="text-sm text-mist space-y-3 leading-relaxed">
          <p>
            <strong>Admin only.</strong> Storage statistics and retention policy for historical
            tables.
          </p>
          <Sub title="Statistics">
            <p>
              Row counts, PostgreSQL size, oldest/newest reading timestamps, and how many rows would
              be removed by the current retention cutoff.
            </p>
          </Sub>
          <Sub title="Data retention">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Off (default)</strong> — data is kept forever.
              </li>
              <li>
                <strong>On</strong> — choose 1–50 years; readings, snapshots, rollups, and health
                events older than the cutoff are deleted.
              </li>
              <li>Automatic purge runs about once per day from the collector when enabled.</li>
              <li>Settings and portal users are never deleted by retention.</li>
            </ul>
          </Sub>
          <Sub title="Manual purge">
            <p>
              Type PURGE to delete old rows immediately using the configured year limit (or the
              years dropdown if retention is off). Export a backup first if you might need the data
              later.
            </p>
          </Sub>
          <Sub title="Snapshot export">
            <p>
              Download stored device snapshots (inverters, system, meters) as JSON or CSV for a
              chosen number of days — useful for offline analysis or support.
            </p>
          </Sub>
        </div>
      </section>

      <Section id="tips" title="Tips & troubleshooting" icon={CircleHelp}>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong className="text-cyan-glow/90">Mobile / tablet</strong> — use the bottom tab bar;
            open{" "}
            <span className="mono">http://&lt;server-lan-ip&gt;:5173</span>, not localhost.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Settings deep links</strong> —{" "}
            <span className="mono">/settings?tab=notifications</span>,{" "}
            <span className="mono">?tab=health</span>, etc.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Blank reports</strong> — collector needs time to
            store readings; check Health and System for PVS connectivity.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Login issues</strong> — use Sign in on an existing
            install; first-time setup uses Create account only when no users exist yet.
          </li>
          <li>
            <strong className="text-cyan-glow/90">After code updates</strong> —{" "}
            <span className="mono">docker compose up -d --build</span> to rebuild API, web, and
            collector.
          </li>
          <li>
            <strong className="text-cyan-glow/90">Prometheus</strong> — metrics at{" "}
            <span className="mono">/metrics</span> on the API port for external monitoring.
          </li>
        </ul>
        <p>
          For install, Docker, and environment variables, see the project{" "}
          <a
            href="https://github.com/digitalexpl0it/SPSM"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-glow hover:underline"
          >
            README on GitHub
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
