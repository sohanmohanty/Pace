import { useEffect, useRef, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getSettings } from "./data/repo";
import { SettingsContext } from "./lib/settingsContext";
import { BottomNav } from "./components/BottomNav";
import { SideNav } from "./components/SideNav";
import { ToastProvider } from "./components/Toast";
import { AddTask } from "./routes/AddTask";
import { Home } from "./routes/Home";
import { LowCapacity } from "./routes/LowCapacity";
import { Onboarding } from "./routes/Onboarding";
import { PlanBuilder } from "./routes/PlanBuilder";
import { Reflection } from "./routes/Reflection";
import { SettingsPage } from "./routes/Settings";
import { TaskDetail } from "./routes/TaskDetail";
import { TasksPage } from "./routes/Tasks";
import { TeacherMessage } from "./routes/TeacherMessage";
import { WeeklyReset } from "./routes/WeeklyReset";

function titleFor(pathname: string): string {
  if (pathname === "/") return "Today · Pace";
  if (pathname.startsWith("/onboarding")) return "Welcome · Pace";
  if (pathname.startsWith("/tasks")) return "Tasks · Pace";
  if (pathname.startsWith("/add")) return "Add task · Pace";
  if (pathname.startsWith("/task/")) return "Task · Pace";
  if (pathname.startsWith("/plan")) return "Today's plan · Pace";
  if (pathname.startsWith("/low")) return "One step at a time · Pace";
  if (pathname.startsWith("/message")) return "Teacher message · Pace";
  if (pathname.startsWith("/reflect")) return "Wrap up · Pace";
  if (pathname.startsWith("/reset")) return "Weekly reset · Pace";
  if (pathname.startsWith("/settings")) return "Settings · Pace";
  return "Pace";
}

/** On navigation: update the title, scroll up, move focus to the page. */
function RouteFx() {
  const { pathname } = useLocation();
  // Track the previous path instead of a first-render flag, because StrictMode runs
  // effects twice on mount, which would defeat the flag and focus the page
  // on initial load (drawing a focus ring around the whole content column).
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

function Shell({ onboarded }: { onboarded: boolean }) {
  const { pathname } = useLocation();
  const isOnboarding = pathname.startsWith("/onboarding");

  const guard = (el: ReactNode) =>
    onboarded ? el : <Navigate to="/onboarding" replace />;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <RouteFx />
      <div className="lg:flex">
        {!isOnboarding && <SideNav />}
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto min-h-dvh w-full max-w-lg flex-1 px-4 pb-32 pt-5 outline-none lg:max-w-5xl lg:px-10 lg:pb-16 lg:pt-8"
        >
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={guard(<Home />)} />
            <Route path="/tasks" element={guard(<TasksPage />)} />
            <Route path="/add" element={guard(<AddTask />)} />
            <Route path="/task/:id" element={guard(<TaskDetail />)} />
            <Route path="/plan" element={guard(<PlanBuilder />)} />
            <Route path="/low" element={guard(<LowCapacity />)} />
            <Route path="/message" element={guard(<TeacherMessage />)} />
            <Route path="/reflect" element={guard(<Reflection />)} />
            <Route path="/reset" element={guard(<WeeklyReset />)} />
            <Route path="/settings" element={guard(<SettingsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {!isOnboarding && <BottomNav />}
    </>
  );
}

export default function App() {
  const settings = useLiveQuery(() => getSettings(), []);

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.classList.toggle("hc", settings.highContrast);
    root.classList.toggle("lgtext", settings.largeText);
    root.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [settings]);

  if (!settings) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-2xl font-semibold tracking-tight text-brand-deep">Pace</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <SettingsContext.Provider value={settings}>
        <ToastProvider>
          <Shell onboarded={settings.onboarded} />
        </ToastProvider>
      </SettingsContext.Provider>
    </BrowserRouter>
  );
}
