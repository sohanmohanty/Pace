import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../lib/nav";

/** Phone-only bottom tab bar (<1024px). Desktop gets the sidebar instead. */
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.78rem] font-medium ${
                isActive ? "text-brand-deep" : "text-soft hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.4 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
