import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "./api";

interface AuthState {
  token: string | null;
  username: string | null;
  isAdmin: boolean;
  setupRequired: boolean;
  loading: boolean;
  hasUser: boolean;
  login: (u: string, p: string) => Promise<boolean>;
  register: (u: string, p: string) => Promise<boolean>;
  logout: () => void;
  refreshStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasUser, setHasUser] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await authApi.status();
      setHasUser(s.has_user);
      if (token) {
        const me = await authApi.me();
        setUsername(me.username);
        setIsAdmin(me.is_admin);
        setSetupRequired(!s.setup_complete);
      }
    } catch {
      if (token) {
        localStorage.removeItem("token");
        setToken(null);
      }
      // Status unreachable — prefer sign-in UI over first-account setup
      setHasUser(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const login = async (u: string, p: string) => {
    const res = await authApi.login(u, p);
    localStorage.setItem("token", res.access_token);
    setToken(res.access_token);
    setSetupRequired(res.setup_required);
    setUsername(u);
    setHasUser(true);
    return res.setup_required;
  };

  const register = async (u: string, p: string) => {
    const res = await authApi.register(u, p);
    localStorage.setItem("token", res.access_token);
    setToken(res.access_token);
    setSetupRequired(true);
    setUsername(u);
    setHasUser(true);
    return true;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        isAdmin,
        setupRequired,
        loading,
        hasUser,
        login,
        register,
        logout,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
