import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { dataApi } from "../lib/api";
import { formatErrorMessage, useToast } from "../lib/toast";

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "inverters", label: "Inverters" },
  { value: "system", label: "System" },
  { value: "meters", label: "Meters" },
];

export function SnapshotExportPanel() {
  const { showToast } = useToast();
  const [category, setCategory] = useState("");
  const [days, setDays] = useState(7);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    const token = localStorage.getItem("token");
    const url = dataApi.exportDevicesUrl({
      category: category || undefined,
      days,
      format,
    });
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition");
      const match = disp?.match(/filename="?([^";]+)"?/);
      const name =
        match?.[1] ||
        `spsm-snapshots-${days}d${category ? `-${category}` : ""}.${format}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("success", "Export downloaded.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card-glow p-6 space-y-4">
      <h3 className="text-sm font-semibold text-cyan-glow flex items-center gap-2">
        <Download className="w-4 h-4" />
        Device snapshot export
      </h3>
      <p className="text-xs text-mist">
        Download stored inverter/system/meter snapshots from the database (JSON or CSV).
      </p>
      <div className="flex flex-wrap gap-3">
        <select
          className="input-dark"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={365}
          className="input-dark w-24"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10) || 7)}
        />
        <span className="text-sm text-mist self-center">days</span>
        <select
          className="input-dark w-24"
          value={format}
          onChange={(e) => setFormat(e.target.value as "json" | "csv")}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="btn-primary flex items-center gap-2"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download
        </button>
      </div>
    </div>
  );
}
