import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sun, User } from "lucide-react";
import { SolarThrobber } from "../components/SolarThrobber";
import { useAuth } from "../lib/auth";
import { authApi } from "../lib/api";

export function LoginPage() {
  const { login, register, hasUser, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = !hasUser && !loading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const setupRequired = isRegister
        ? await register(username, password)
        : await login(username, password);
      navigate(setupRequired ? "/settings" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SolarThrobber label="Initializing…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-void">
      <div className="card-glow w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-8">
          <Sun className="w-10 h-10 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-gradient">SPSM Portal</h1>
            <p className="text-sm text-mist">
              {isRegister ? "Create your admin account" : "Sign in to your solar dashboard"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-mist flex items-center gap-1 mb-1">
              <User className="w-3 h-3" /> Username
            </label>
            <input
              className="input-dark"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs text-mist flex items-center gap-1 mb-1">
              <Lock className="w-3 h-3" /> Password
            </label>
            <input
              type="password"
              className="input-dark"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 6 : 1}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        {isRegister ? (
          <p className="text-xs text-mist mt-6 text-center">
            First account becomes admin. You&apos;ll configure your PVS next.
          </p>
        ) : (
          <p className="text-xs text-mist mt-6 text-center">
            Default dev login: <span className="text-cyan-glow font-mono">admin</span> /{" "}
            <span className="text-cyan-glow font-mono">admin</span>
          </p>
        )}
      </div>
    </div>
  );
}
