import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Command, Info, Plus, Waypoints } from "lucide-react";
import { NAV_ITEMS } from "../lib/nav";
import { Wordmark } from "./Logo";
import { Button } from "./ui";

/**
 * Shared navigation: bottom tabs on phones, a left rail at 1024px and above.
 * The desktop rail adds the wordmark and an add button. Both layouts use
 * the same five destinations and switch through CSS breakpoints.
 */

export function Shell({
  children,
  hideChrome = false,
  onOpenPalette
}: {
  children: ReactNode;
  hideChrome?: boolean;
  onOpenPalette?: () => void;
}) {
  return (
    <div className="lg:flex">
      {!hideChrome && <Rail onOpenPalette={onOpenPalette} />}
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto min-h-dvh w-full max-w-lg flex-1 px-4 pt-5 outline-none lg:max-w-5xl lg:px-10 lg:pt-8 ${
          hideChrome ? "pb-10" : "pb-32 lg:pb-16"
        }`}
      >
        {children}
      </main>
      {!hideChrome && <Tabs />}
    </div>
  );
}

function Rail({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const navigate = useNavigate();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-4 py-6 lg:flex">
      <NavLink to="/" className="px-2" aria-label="Pace, Today">
        <Wordmark />
      </NavLink>

      <Button className="mt-6" onClick={() => navigate("/capture")}>
        <Plus aria-hidden="true" size={19} />
        Add task
      </Button>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-[0.875rem] px-3 font-medium transition-colors ${
                isActive ? "bg-brand-soft text-brand-deep" : "text-soft hover:bg-surface-2 hover:text-ink"
              }`
            }
          >
            <Icon aria-hidden="true" size={20} />
            {label}
          </NavLink>
        ))}
        <div className="mx-3 my-2 border-t border-line" aria-hidden="true" />
        {[
          { to: "/about", label: "About Pace", icon: Info },
          { to: "/how", label: "How it thinks", icon: Waypoints }
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-[0.875rem] px-3 font-medium transition-colors ${
                isActive ? "bg-brand-soft text-brand-deep" : "text-soft hover:bg-surface-2 hover:text-ink"
              }`
            }
          >
            <Icon aria-hidden="true" size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="mt-4 flex min-h-10 items-center justify-between rounded-[0.875rem] border border-line px-3 text-[0.9rem] text-soft hover:border-line-strong hover:text-ink"
        >
          <span className="inline-flex items-center gap-2">
            <Command aria-hidden="true" size={15} />
            Jump to
          </span>
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[0.75rem]">⌘K</kbd>
        </button>
      )}

    </aside>
  );
}

function Tabs() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.74rem] font-medium ${
                isActive ? "text-brand-deep" : "text-soft hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-7 w-11 place-items-center rounded-full transition-colors ${
                    isActive ? "bg-brand-soft" : ""
                  }`}
                >
                  <Icon aria-hidden="true" size={21} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
