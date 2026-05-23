import { NavLink } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { moreNavLinks } from "../lib/navLinks";

type Props = {
  open: boolean;
  username: string | null;
  onClose: () => void;
  onLogout: () => void;
};

export function MobileMoreSheet({ open, username, onClose, onLogout }: Props) {
  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="absolute bottom-0 inset-x-0 max-h-[70vh] rounded-t-2xl border-t border-surface/80 bg-panel shadow-glow-card pb-[env(safe-area-inset-bottom)] animate-[toast-in_0.2s_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface/80">
          <div>
            <p className="text-sm font-medium text-cyan-glow">More</p>
            {username && <p className="text-xs text-mist truncate">{username}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-mist hover:text-cyan-glow hover:bg-surface/60"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(70vh-8rem)]">
          {moreNavLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `nav-link w-full min-h-[2.75rem] ${isActive ? "active" : ""}`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="nav-link w-full min-h-[2.75rem] text-red-400/80 hover:text-red-400"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </nav>
      </div>
    </div>
  );
}
