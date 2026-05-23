import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { allNavLinks } from "../lib/navLinks";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const morePaths = ["/system", "/settings", "/help"];
  const moreActive = morePaths.some((p) => location.pathname.startsWith(p));

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="hidden md:flex w-56 border-r border-surface/80 bg-panel/50 flex-col p-4 shrink-0">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold bg-gradient-header bg-clip-text text-transparent">
            SPSM
          </h1>
          <p className="text-xs text-mist mt-1">Solar Portal</p>
        </div>

        <nav className="flex-1 space-y-1">
          {allNavLinks.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? to === "/"}
              className={({ isActive }) =>
                `nav-link w-full ${isActive ? "active" : ""}`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="pt-4 border-t border-surface">
          <p className="text-xs text-mist px-2 mb-2 truncate">{username}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="nav-link w-full text-red-400/80 hover:text-red-400"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-3 pb-24 md:p-6 md:pb-6 overflow-x-hidden overflow-y-auto min-w-0">
        <Outlet />
      </main>

      <MobileBottomNav onMore={() => setMoreOpen(true)} moreActive={moreActive || moreOpen} />
      <MobileMoreSheet
        open={moreOpen}
        username={username}
        onClose={() => setMoreOpen(false)}
        onLogout={handleLogout}
      />
    </div>
  );
}
