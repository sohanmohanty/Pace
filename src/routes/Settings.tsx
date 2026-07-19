import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { Button, Card, Field, PageHeader, SectionTitle } from "../components/ui";
import { clearDemoData, hasDemoData, loadDemoData } from "../data/demo";
import { deleteAllData, exportAll, getSettings, importData, updateSettings } from "../data/repo";
import { todayISO } from "../lib/dates";

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-[0.9rem] text-soft">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const settings = useLiveQuery(() => getSettings(), []);
  const demo = useLiveQuery(() => hasDemoData(), []);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [name, setName] = useState("");
  const seededName = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);
  const importing = useRef(false);

  useEffect(() => {
    if (settings && !seededName.current) {
      seededName.current = true;
      setName(settings.studentName ?? "");
    }
  }, [settings]);

  if (settings === undefined) return null;

  async function exportData() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pace-data-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported. The file is yours");
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || importing.current) return;
    importing.current = true;
    try {
      const data: unknown = JSON.parse(await file.text());
      const n = await importData(data);
      toast(`Imported ${n} item${n === 1 ? "" : "s"}, merged into your data`);
    } catch (err) {
      toast(
        err instanceof Error && err.message.startsWith("That file")
          ? err.message
          : "Couldn't read that file. Is it a Pace export?"
      );
    } finally {
      importing.current = false;
    }
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader title="Settings" />

      <Card>
        <SectionTitle>Display</SectionTitle>
        <div className="mt-2 divide-y divide-line">
          <ToggleRow
            label="Larger text"
            hint="Increases text size across the app."
            checked={settings.largeText}
            onChange={(v) => updateSettings({ largeText: v })}
          />
          <ToggleRow
            label="High contrast"
            hint="Stronger colors and borders."
            checked={settings.highContrast}
            onChange={(v) => updateSettings({ highContrast: v })}
          />
          <ToggleRow
            label="Reduce animations"
            hint="Also follows your system setting automatically."
            checked={settings.reduceMotion}
            onChange={(v) => updateSettings({ reduceMotion: v })}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle>About you</SectionTitle>
        <Field
          label="Name"
          hint="Optional. Only used to sign teacher messages. Never leaves this device."
          className="mt-2"
        >
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => updateSettings({ studentName: name || undefined })}
            placeholder="Your name"
          />
        </Field>
      </Card>

      <Card>
        <SectionTitle>Your data</SectionTitle>
        <p className="mt-2 text-soft">
          Everything Pace knows lives in this browser's local storage: tasks, plans, check-ins,
          and reflections. There is no account, no server, and no tracking. Pace never asks for a
          diagnosis or medical details.
        </p>
        <div className="mt-4 space-y-2">
          <Button variant="soft" size="lg" onClick={exportData}>
            <Download aria-hidden="true" size={18} />
            Export my data (JSON)
          </Button>
          <Button variant="soft" size="lg" onClick={() => importInput.current?.click()}>
            <Upload aria-hidden="true" size={18} />
            Import data (JSON)
          </Button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={importFile}
          />
          <p className="text-[0.9rem] text-soft">
            Import merges a Pace export into this device. Nothing here gets deleted. Moving to a
            new device? Export there, import here. To fully restore a backup instead, use "Delete
            everything" first.
          </p>
          {demo ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={async () => {
                await clearDemoData();
                toast("Sample data cleared");
              }}
            >
              Clear sample data
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="lg"
              onClick={async () => {
                await loadDemoData();
                toast("Sample data loaded");
              }}
            >
              Load sample data
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={() => setConfirmWipe(true)}>
            <Trash2 aria-hidden="true" size={18} />
            Delete everything
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>About Pace</SectionTitle>
        <p className="mt-2 text-soft">
          Pace is a planning tool for students returning from disruptions. It is not a medical
          tool and does not provide medical advice. You never need to explain what happened,
          not to Pace or to anyone else.
        </p>
        <p className="mt-2 text-soft">Works offline once loaded. Free, open source.</p>
        <p className="mt-3">
          <a
            className="font-medium text-brand-deep underline underline-offset-2"
            href="mailto:sohanm4364@gmail.com?subject=Pace%20feedback"
          >
            Send feedback
          </a>
        </p>
        <p className="mt-2 text-[0.85rem] text-soft">Pace v0.1</p>
      </Card>

      <ConfirmDialog
        open={confirmWipe}
        title="Delete everything?"
        body="This permanently removes all tasks, plans, check-ins, reflections, and settings from this device. There's no undo."
        confirmLabel="Delete it all"
        onConfirm={async () => {
          await deleteAllData();
          window.location.assign("/");
        }}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  );
}
