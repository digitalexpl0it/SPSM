import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CircleHelp,
  HeartPulse,
  Home,
  Settings,
  Sun,
  Zap,
} from "lucide-react";

export type NavLinkItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
};

export const primaryNavLinks: NavLinkItem[] = [
  { to: "/", icon: Home, label: "Dashboard", end: true },
  { to: "/inverters", icon: Sun, label: "Inverters" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/health", icon: HeartPulse, label: "Health" },
];

export const moreNavLinks: NavLinkItem[] = [
  { to: "/system", icon: Zap, label: "System" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/help", icon: CircleHelp, label: "Help" },
];

export const allNavLinks: NavLinkItem[] = [...primaryNavLinks, ...moreNavLinks];
