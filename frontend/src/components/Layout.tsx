import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, LogOut, Settings, Sun, Zap } from "lucide-react";
import { useAuth } from "../lib/auth";
const links = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/inverters", icon: Sun, label: "Inverters" },
  { to: "/system", icon: Zap, label: "System" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-surface/80 bg-panel/50 flex flex-col p-4">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold bg-gradient-header bg-clip-text text-transparent">
            SPSM
          </h1>
          <p className="text-xs text-mist mt-1">Solar Portal</p>
        </div>

        <nav className="flex-1 space-y-1">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
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

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
