import {
  CalendarRange,
  Home,
  ListTodo,
  Mail,
  Settings,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

// Single source for both navs (bottom tabs on phones, rail on desktop).
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Today", icon: Home, end: true },
  { to: "/tasks", label: "Tasks", icon: ListTodo, end: false },
  { to: "/week", label: "Week", icon: CalendarRange, end: false },
  { to: "/message", label: "Message", icon: Mail, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false }
];
