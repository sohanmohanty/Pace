import { Command } from "cmdk";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useNavigate } from "react-router-dom";
import {
  CalendarRange,
  Contrast,
  Download,
  Home,
  ListTodo,
  Mail,
  Moon,
  MonitorSmartphone,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Settings,
  Sunset
} from "lucide-react";
import { exportAll, updateSettings } from "../data/repo";
import { todayISO } from "../lib/dates";
import type { ThemeMode } from "../data/types";

/**
 * Keyboard navigation and actions, opened with Cmd+K or Ctrl+K. cmdk handles
 * filtering and arrow keys; React Aria handles the modal, focus trap, Escape,
 * and scroll lock. Desktop padding centers the grid overlay in the content
 * column beside the navigation rail.
 */
export function CommandPalette({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  async function setTheme(theme: ThemeMode) {
    onOpenChange(false);
    await updateSettings({ theme, highContrast: theme === "hc" });
  }

  async function exportData() {
    onOpenChange(false);
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pace-data-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-[oklch(0.15_0.02_240/0.45)] px-4 pt-[12vh] backdrop-blur-[2px] lg:pl-60"
    >
      <Modal className="w-full max-w-[34rem] outline-none">
        <Dialog aria-label="Jump to" className="overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-lg outline-none">
          <Command label="Jump to" loop>
            <Command.Input placeholder="Jump to a screen or do something…" autoFocus />
            <Command.List>
              <Command.Empty>Nothing matches.</Command.Empty>
              <Command.Group heading="Do">
                <Command.Item onSelect={() => go("/capture")}>
                  <Plus size={17} aria-hidden="true" /> Add a task
                </Command.Item>
                <Command.Item onSelect={() => go("/plan")}>
                  <SlidersHorizontal size={17} aria-hidden="true" /> Check in or adjust today's plan
                </Command.Item>
                <Command.Item onSelect={() => go("/focus")}>
                  <Play size={17} aria-hidden="true" /> Start the next step
                </Command.Item>
                <Command.Item onSelect={() => go("/reflect")}>
                  <Sunset size={17} aria-hidden="true" /> Wrap up the day
                </Command.Item>
                <Command.Item onSelect={exportData}>
                  <Download size={17} aria-hidden="true" /> Export my data
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to">
                <Command.Item onSelect={() => go("/")}>
                  <Home size={17} aria-hidden="true" /> Today
                </Command.Item>
                <Command.Item onSelect={() => go("/tasks")}>
                  <ListTodo size={17} aria-hidden="true" /> Tasks
                </Command.Item>
                <Command.Item onSelect={() => go("/week")}>
                  <CalendarRange size={17} aria-hidden="true" /> Week
                </Command.Item>
                <Command.Item onSelect={() => go("/message")}>
                  <Mail size={17} aria-hidden="true" /> Teacher message
                </Command.Item>
                <Command.Item onSelect={() => go("/insights")}>
                  <Sparkles size={17} aria-hidden="true" /> What Pace has learned
                </Command.Item>
                <Command.Item onSelect={() => go("/settings")}>
                  <Settings size={17} aria-hidden="true" /> Settings
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Theme">
                <Command.Item onSelect={() => setTheme("system")}>
                  <MonitorSmartphone size={17} aria-hidden="true" /> Match device
                </Command.Item>
                <Command.Item onSelect={() => setTheme("light")}>
                  <Sun size={17} aria-hidden="true" /> Light
                </Command.Item>
                <Command.Item onSelect={() => setTheme("dark")}>
                  <Moon size={17} aria-hidden="true" /> Dark
                </Command.Item>
                <Command.Item onSelect={() => setTheme("hc")}>
                  <Contrast size={17} aria-hidden="true" /> High contrast
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
