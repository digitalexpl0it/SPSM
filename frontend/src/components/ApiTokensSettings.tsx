import { useCallback, useEffect, useState } from "react";
import { Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { tokensApi, type ApiTokenItem } from "../lib/api";
import { apiDocsUrl } from "../lib/apiBase";
import { formatErrorMessage, useToast } from "../lib/toast";

export function ApiTokensSettings() {
  const { showToast } = useToast();
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTokens(await tokensApi.list());
    } catch (e) {
      showToast("error", formatErrorMessage(e));
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      showToast("error", "Enter a name for the token.");
      return;
    }
    setCreating(true);
    try {
      const days = expiresDays.trim() ? parseInt(expiresDays, 10) : undefined;
      const res = await tokensApi.create(name.trim(), days);
      setNewToken(res.token);
      setName("");
      setExpiresDays("");
      await load();
      showToast("success", "Token created — copy it now; it won't be shown again.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (t: ApiTokenItem) => {
    if (!window.confirm(`Revoke API token "${t.name}"?`)) return;
    try {
      await tokensApi.remove(t.id);
      await load();
      showToast("success", "Token revoked.");
    } catch (e) {
      showToast("error", formatErrorMessage(e));
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      showToast("success", "Copied to clipboard.");
    } catch {
      showToast("error", "Could not copy — select and copy manually.");
    }
  };

  if (loading) return <p className="text-sm text-mist">Loading API tokens…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-mist max-w-2xl">
        Programmatic access for scripts and integrations. Use{" "}
        <span className="mono text-cyan-glow/90">Authorization: Bearer spsm_…</span> on API
        requests, or authorize in{" "}
        <a href={apiDocsUrl()} target="_blank" rel="noopener noreferrer" className="text-cyan-glow hover:underline">
          Swagger
        </a>
        . Tokens are tied to your admin account.
      </p>

      {newToken && (
        <div className="card-glow p-4 border border-amber-500/40 space-y-2">
          <p className="text-sm text-amber-300 font-medium">New token (shown once)</p>
          <code className="block text-xs mono break-all text-cyan-glow bg-surface/60 p-2 rounded-lg">
            {newToken}
          </code>
          <button
            type="button"
            onClick={copyToken}
            className="flex items-center gap-2 text-sm text-cyan-glow border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
        </div>
      )}

      <div className="card-glow p-4 space-y-3">
        <h3 className="text-sm font-medium text-cyan-glow flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create token
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            className="input-dark flex-1 min-w-[10rem]"
            placeholder="Name (e.g. Home Assistant)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={3650}
            className="input-dark w-28"
            placeholder="Days"
            title="Optional expiry in days"
            value={expiresDays}
            onChange={(e) => setExpiresDays(e.target.value)}
          />
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="btn-primary flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>

      <div className="card-glow overflow-hidden">
        <table className="table-zebra hidden md:table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expires</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-mist py-6">
                  No API tokens yet.
                </td>
              </tr>
            ) : (
              tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="mono text-xs">{t.token_prefix}…</td>
                  <td className="text-xs text-mist">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="text-xs text-mist">
                    {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "—"}
                  </td>
                  <td className="text-xs text-mist">
                    {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "Never"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => remove(t)}
                      className="p-2 text-mist hover:text-red-400"
                      aria-label={`Revoke ${t.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="md:hidden p-3 space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="rounded-lg border border-surface/80 p-3 text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-cyan-glow/90">{t.name}</span>
                <button type="button" onClick={() => remove(t)} className="text-red-400/80">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-mist mono">{t.token_prefix}…</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
