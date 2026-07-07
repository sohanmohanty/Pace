import { NavLink, useNavigate } from "react-router-dom";
import { Plus, RotateCcw } from "lucide-react";
import { NAV_ITEMS } from "../lib/nav";
import { Button } from "./ui";

const linkClass = (isActive: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors ${
    isActive ? "bg-brand-soft text-brand-deep" : "text-soft hover:bg-bg hover:text-ink"
  }`;

/** Desktop-only sidebar (≥1024px). Phones keep the bottom tab bar. */
export function SideNav() {
  const navigate = useNavigate();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-4 py-6 lg:flex">
      <div className="px-3">
        <p className="text-2xl font-semibold tracking-tight text-brand-deep">Pace</p>
        <p className="mt-0.5 text-[0.85rem] text-soft">Re-entry planner</p>
      </div>

      <Button className="mt-5" onClick={() => navigate("/add")}>
        <Plus aria-hidden="true" size={19} />
        Add task
      </Button>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => linkClass(isActive)}>
            <Icon aria-hidden="true" size={20} />
            {label}
          </NavLink>
        ))}
        <div className="mx-3 my-2 border-t border-line" aria-hidden="true" />
        <NavLink to="/reset" className={({ isActive }) => linkClass(isActive)}>
          <RotateCcw aria-hidden="true" size={20} />
          Weekly reset
        </NavLink>
      </nav>

      <p className="mt-auto px-3 pt-6 text-[0.8rem] leading-snug text-soft">
        Private by design — your data stays on this device.
      </p>
    </aside>
  );
}
