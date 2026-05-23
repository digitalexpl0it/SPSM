import { useMemo, useState } from "react";
import { Copy, Loader2, Terminal } from "lucide-react";
import { pvsApi } from "../lib/api";
import { formatErrorMessage, useToast } from "../lib/toast";

type Props = {
  pvsHost: string;
  pvsSerial: string;
  pvsVerifySsl: boolean;
};

function varsToRows(obj: Record<string, unknown>): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        const key = k.startsWith("/") ? `${k}/${sk}`.replace(/\/+/g, "/") : `${k}/${sk}`;
        rows.push({ key, value: sv == null ? "" : String(sv) });
      }
    } else {
      rows.push({ key: k, value: v == null ? "" : String(v) });
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export function PvsVarserverExplorer({ pvsHost, pvsSerial, pvsVerifySsl }: Props) {
  const { showToast } = useToast();
  const [prefix, setPrefix] = useState("sys");
  const [varsLoading, setVarsLoading] = useState(false);
  const [vars, setVars] = useState<Record<string, unknown>>({});
  const [filter, setFilter] = useState("");
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = varsToRows(vars);
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [vars, filter]);

  const loadVars = async () => {
    if (!pvsHost.trim() || !pvsSerial.trim()) {
      showToast("error", "Enter PVS host and serial above, then save or fetch.");
      return;
    }
    setVarsLoading(true);
    setError(null);
    setFetched(false);
    try {
      const res = await pvsApi.vars(prefix, {
        pvs_host: pvsHost.trim(),
        pvs_serial: pvsSerial.trim(),
        pvs_verify_ssl: pvsVerifySsl,
      });
      if (!res.ok) {
        const msg = res.error || "PVS not configured or unreachable.";
        setError(msg);
        setVars({});
        showToast("error", msg);
        return;
      }
      setVars(res.vars || {});
      setFetched(true);
      const count = varsToRows(res.vars || {}).length;
      if (count === 0) {
        setError("No variables returned — try prefix sys, livedata, inverter, or meter.");
      } else {
        setError(null);
      }
    } catch (e) {
      const msg = formatErrorMessage(e);
      setError(msg);
      setVars({});
      showToast("error", msg);
    } finally {
      setVarsLoading(false);
    }
  };

  const copyValue = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", "Copied.");
    } catch {
      showToast("error", "Could not copy.");
    }
  };

  return (
    <section className="card-glow p-6 space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-glow">
        <Terminal className="w-5 h-5" />
        Varserver explorer
      </h2>
      <p className="text-xs text-mist">
        Live read from your PVS using the host and serial above (uses saved settings if fields match).
        Admin only.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input-dark mono flex-1 min-w-[8rem]"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="sys, livedata, inverter…"
          list="var-prefix-hints"
        />
        <datalist id="var-prefix-hints">
          <option value="sys" />
          <option value="livedata" />
          <option value="inverter" />
          <option value="meter" />
          <option value="info" />
        </datalist>
        <button
          type="button"
          onClick={loadVars}
          disabled={varsLoading}
          className="px-4 py-2 rounded-xl border border-cyan/30 text-cyan-glow text-sm hover:bg-cyan/10 min-h-[2.75rem]"
        >
          {varsLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching…
            </span>
          ) : (
            "Fetch"
          )}
        </button>
      </div>
      {fetched && (
        <>
          <input
            className="input-dark text-sm"
            placeholder="Filter keys or values…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <p className="text-xs text-mist">
            {rows.length} variable{rows.length !== 1 ? "s" : ""}
            {error && <span className="text-amber-400/90"> · {error}</span>}
          </p>
          {rows.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-surface/80">
              <table className="table-zebra text-xs hidden sm:table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="mono text-cyan-glow/80 break-all">{r.key}</td>
                      <td className="text-mist break-all">{r.value}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => copyValue(r.value)}
                          className="p-1 text-mist hover:text-cyan-glow"
                          aria-label="Copy value"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sm:hidden divide-y divide-surface/80">
                {rows.map((r) => (
                  <div key={r.key} className="p-2 space-y-1">
                    <p className="mono text-cyan-glow/80 break-all text-[10px]">{r.key}</p>
                    <div className="flex justify-between gap-2">
                      <p className="text-mist break-all flex-1">{r.value}</p>
                      <button
                        type="button"
                        onClick={() => copyValue(r.value)}
                        className="shrink-0 p-1 text-mist"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
