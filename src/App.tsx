import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
const CommandPalette = lazy(() => import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })));
import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/Toast";
import { getSettings, getTodayCheckIn } from "./data/repo";
import { SettingsContext } from "./lib/settingsContext";
import { applyTheme, resolveTheme } from "./lib/theme";
import { tintHueForDial } from "./logic/capacity";
import { maybeAutoSync } from "./data/feeds";
import { setDeviceToken } from "./ai/client";
import { getProfile } from "./data/repo";
import { Home } from "./routes/Home";
import { Landing } from "./routes/Landing";

// Lazy-load routes beyond Landing and Today to keep their bundles small.
// Shared vendor chunks are configured in vite.config.ts.
const Capture = lazy(() => import("./routes/Capture").then((m) => ({ default: m.Capture })));
const Insights = lazy(() => import("./routes/Insights").then((m) => ({ default: m.Insights })));
const Focus = lazy(() => import("./routes/Focus").then((m) => ({ default: m.Focus })));
const How = lazy(() => import("./routes/How").then((m) => ({ default: m.How })));
const Showreel = lazy(() => import("./routes/Showreel").then((m) => ({ default: m.Showreel })));
const LowCapacity = lazy(() => import("./routes/LowCapacity").then((m) => ({ default: m.LowCapacity })));
const Onboarding = lazy(() => import("./routes/Onboarding").then((m) => ({ default: m.Onboarding })));
const PlanBuilder = lazy(() => import("./routes/PlanBuilder").then((m) => ({ default: m.PlanBuilder })));
const Reflection = lazy(() => import("./routes/Reflection").then((m) => ({ default: m.Reflection })));
const SettingsPage = lazy(() => import("./routes/Settings").then((m) => ({ default: m.SettingsPage })));
const TaskDetail = lazy(() => import("./routes/TaskDetail").then((m) => ({ default: m.TaskDetail })));
const TasksPage = lazy(() => import("./routes/Tasks").then((m) => ({ default: m.TasksPage })));
const TeacherMessage = lazy(() => import("./routes/TeacherMessage").then((m) => ({ default: m.TeacherMessage })));
const Week = lazy(() => import("./routes/Week").then((m) => ({ default: m.Week })));

function titleFor(pathname: string): string {
  if (pathname === "/") return document.documentElement.dataset.onboarded === "1" ? "Today · Pace" : "Pace: a planner that plans around how you feel";
  if (pathname.startsWith("/how")) return "How Pace thinks";
  if (pathname.startsWith("/about")) return "About Pace";
  if (pathname.startsWith("/showreel")) return "Pace showreel";
  if (pathname.startsWith("/onboarding")) return "Pace: A planner that plans around how you feel";
  if (pathname.startsWith("/tasks")) return "Tasks · Pace";
  if (pathname.startsWith("/add") || pathname.startsWith("/capture")) return "Add task · Pace";
  if (pathname.startsWith("/insights")) return "What Pace learned · Pace";
  if (pathname.startsWith("/task/")) return "Task · Pace";
  if (pathname.startsWith("/plan")) return "Shape today · Pace";
  if (pathname.startsWith("/focus") || pathname.startsWith("/low")) return "Focus · Pace";
  if (pathname.startsWith("/message")) return "Teacher message · Pace";
  if (pathname.startsWith("/reflect")) return "Wrap up · Pace";
  if (pathname.startsWith("/week") || pathname.startsWith("/reset")) return "Week · Pace";
  if (pathname.startsWith("/settings")) return "Settings · Pace";
  return "Pace";
}

/** On navigation: update the title, scroll up, move focus to the page. */
function RouteFx() {
  const { pathname } = useLocation();
  const prevPath = useRef<string | null>(null);
  useEffect(() => {
    document.title = titleFor(pathname);
    if (prevPath.current !== null && prevPath.current !== pathname) {
      window.scrollTo(0, 0);
      document.getElementById("main")?.focus({ preventScroll: true });
    }
    prevPath.current = pathname;
  }, [pathname]);
  return null;
}

function Body({ onboarded }: { onboarded: boolean }) {
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const immersive =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/focus") ||
    pathname.startsWith("/low") ||
    pathname.startsWith("/how") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/showreel") ||
    (pathname === "/" && !onboarded);

  const guard = (el: ReactNode) => (onboarded ? el : <Navigate to="/onboarding" replace />);

  // Open the command palette with Cmd+K or Ctrl+K; load it on first use.
  useEffect(() => {
    if (!onboarded) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onboarded]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <RouteFx />
      <Shell hideChrome={immersive} onOpenPalette={() => setPaletteOpen(true)}>
        <Suspense fallback={<div className="min-h-[40dvh]" aria-busy="true" />}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/how" element={<How />} />
          <Route path="/about" element={<Landing />} />
          <Route path="/showreel" element={<Showreel />} />
          <Route path="/" element={onboarded ? <Home /> : <Landing />} />
          <Route path="/tasks" element={guard(<TasksPage />)} />
          <Route path="/add" element={guard(<Capture />)} />
          <Route path="/capture" element={guard(<Capture />)} />
          <Route path="/insights" element={guard(<Insights />)} />
          <Route path="/task/:id" element={guard(<TaskDetail />)} />
          <Route path="/plan" element={guard(<PlanBuilder />)} />
          <Route path="/focus" element={guard(<Focus />)} />
          <Route path="/focus/:id" element={guard(<Focus />)} />
          <Route path="/low" element={guard(<LowCapacity />)} />
          <Route path="/message" element={guard(<TeacherMessage />)} />
          <Route path="/reflect" element={guard(<Reflection />)} />
          <Route path="/week" element={guard(<Week />)} />
          <Route path="/reset" element={<Navigate to="/week" replace />} />
          <Route path="/settings" element={guard(<SettingsPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Shell>
      {onboarded && paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  const settings = useLiveQuery(() => getSettings(), []);
  const checkIn = useLiveQuery(async () => (await getTodayCheckIn()) ?? null, []);

  // Apply the theme to <html> and update it when the system preference changes.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.onboarded = settings.onboarded ? "1" : "0";
    root.classList.toggle("lgtext", settings.largeText);
    root.classList.toggle("reduce-motion", settings.reduceMotion);
    const apply = () => applyTheme(resolveTheme(settings));
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  // Attach the anonymous device token to AI calls for the daily usage cap.
  useEffect(() => {
    void getProfile().then((p) => setDeviceToken(p.deviceToken)).catch(() => undefined);
  }, []);

  // Refresh calendar feeds on app open, at most once every six hours.
  useEffect(() => {
    if (settings?.onboarded) void maybeAutoSync().catch(() => undefined);
  }, [settings?.onboarded]);

  // Initialize the tint from the saved check-in. Dial screens update it while dragging.
  useEffect(() => {
    if (checkIn?.dial !== undefined) {
      document.documentElement.style.setProperty("--cap-h", String(Math.round(tintHueForDial(checkIn.dial))));
    }
  }, [checkIn]);

  if (!settings) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <p className="font-display text-3xl text-brand-deep">Pace</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <SettingsContext.Provider value={settings}>
        <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>
          <ToastProvider>
            <Body onboarded={settings.onboarded} />
          </ToastProvider>
        </MotionConfig>
      </SettingsContext.Provider>
    </BrowserRouter>
  );
}
