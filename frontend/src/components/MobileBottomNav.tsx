import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { primaryNavLinks } from "../lib/navLinks";

type Props = {
  onMore: () => void;
  moreActive: boolean;
};

export function MobileBottomNav({ onMore, moreActive }: Props) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-surface/80 bg-panel/95 backdrop-blur-md safe-bottom"
      aria-label="Main navigation"
    >
      <ul className="flex items-stretch justify-around max-w-lg mx-auto">
        {primaryNavLinks.map(({ to, icon: Icon, label, end }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[3.25rem] text-xs transition ${
                  isActive ? "text-cyan-glow" : "text-mist"
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden />
              <span className="truncate w-full text-center">{label}</span>
            </NavLink>
          </li>
        ))}
        <li className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onMore}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[3.25rem] w-full text-xs transition ${
              moreActive ? "text-cyan-glow" : "text-mist"
            }`}
            aria-expanded={moreActive}
            aria-haspopup="dialog"
          >
            <Menu className="w-5 h-5 shrink-0" aria-hidden />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
