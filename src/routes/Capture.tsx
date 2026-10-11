import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Check, ClipboardPaste, FileText, Image as ImageIcon, Link2, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { ai, AIError } from "../ai/client";
import { QuickAdd } from "../components/QuickAdd";
import { TaskForm } from "../components/TaskForm";
import { useToast } from "../components/Toast";
import { Button, Card, Chip, Eyebrow, Field, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { addFeed, FeedError, removeFeed, syncAllFeeds } from "../data/feeds";
import { addEvent, addSubtasks, addTask, getProfile, type TaskDraft } from "../data/repo";
import type { Level } from "../data/types";
import { formatDueLabel, todayISO } from "../lib/dates";
import { minutesLabel } from "../lib/labels";
import { generateSubtasks } from "../logic/breakdown";
import type { ExtractedTask } from "../shared/schema";

// Add tasks through quick-add, the form, text/photo extraction, or feeds.
// Extraction returns a list to review, with field confidence and source
// highlights. Save extracted items only after the student accepts them.

type Tab = "quick" | "paste" | "form" | "feed";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "quick", label: "Quick", icon: ClipboardPaste },
  { id: "paste", label: "Paste or photo", icon: ImageIcon },
  { id: "form", label: "Full form", icon: FileText },
  { id: "feed", label: "Calendar feed", icon: CalendarPlus }
];

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function Capture() {
  const [params] = useSearchParams();
  const initial = (params.get("tab") as Tab | null) ?? "quick";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : "quick");
  return (
    <div className="space-y-5">
      <PageHeader title="Add a task" subtitle="Type one line, paste a page, snap a photo, or connect a calendar." />

      <div role="tablist" aria-label="Ways to add" className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[0.92rem] font-medium transition-colors ${
              tab === id ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:border-line-strong"
            }`}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "quick" && (
        <div className="space-y-4 lg:max-w-2xl">
          <Card>
            <QuickAdd />
          </Card>
          <p className="text-[0.9rem] text-soft">
            Tokens: <code className="rounded bg-surface-2 px-1">due fri</code>, <code className="rounded bg-surface-2 px-1">~2h</code>,{" "}
            <code className="rounded bg-surface-2 px-1">hard</code>, <code className="rounded bg-surface-2 px-1">!!</code>,{" "}
            <code className="rounded bg-surface-2 px-1">#biology</code>, <code className="rounded bg-surface-2 px-1">@teacher</code>. Everything else is the title.
          </p>
        </div>
      )}
      {tab === "paste" && <PasteOrPhoto />}
      {tab === "form" && <FormTab />}
      {tab === "feed" && <FeedTab />}
    </div>
  );
}

/* Full form */

function FormTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const [autoBreak, setAutoBreak] = useState(true);

  async function save(draft: TaskDraft) {
    const id = await addTask(draft);
    let withSteps = false;
    if (autoBreak && draft.estimatedMinutes > 25) {
      const task = await db.tasks.get(id);
      if (task) {
        await addSubtasks(generateSubtasks(task));
        withSteps = true;
      }
    }
    toast(withSteps ? "Added and broken into steps" : "Added to your tasks");
    navigate(`/task/${id}`);
  }

  return (
    <Card className="lg:max-w-2xl">
      <TaskForm onSubmit={save} submitLabel="Add to my tasks" />
      <label className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
        <span>
          <span className="font-medium">Break into steps automatically</span>
          <span className="block text-[0.9rem] text-soft">Bigger tasks get a ready-made step list you can edit.</span>
        </span>
        <input type="checkbox" className="toggle" checked={autoBreak} onChange={(e) => setAutoBreak(e.target.checked)} />
      </label>
    </Card>
  );
}

/* Paste or photo */

type Reviewed = ExtractedTask & { accepted: boolean; key: string };

function PasteOrPhoto() {
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [items, setItems] = useState<Reviewed[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const courses = useLiveQuery(async () => [...new Set((await db.tasks.toArray()).map((t) => t.course).filter(Boolean))] as string[], []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("That isn't an image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast("That photo is too large. Try a smaller one");
      return;
    }
    const dataUrl = await downscale(file);
    setImage(dataUrl);
    setImageName(file.name);
  }

  async function extract() {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    setError(null);
    setItems(null);
    setProgress("Reading…");
    try {
      const profile = await getProfile();
      const { result } = await ai.extract(
        { text: text.trim() || null, image, today: todayISO(), knownCourses: courses ?? [], termEnd: profile.termEnd ?? null },
        { onDelta: (acc) => setProgress(acc.length < 200 ? "Reading…" : `Found ${(acc.match(/"title"/g) ?? []).length} so far…`) }
      );
      setItems(result.items.map((it, i) => ({ ...it, accepted: true, key: `${i}-${it.title}` })));
      setNote(result.note);
    } catch (e) {
      setError(
        e instanceof AIError && e.code === "no_provider"
          ? "The planner isn't connected on this server. Use Quick add or the form instead."
          : e instanceof AIError
            ? e.message
            : "Couldn't read that. Try again or paste less at once."
      );
    } finally {
      setBusy(false);
    }
  }

  function update(key: string, patch: Partial<Reviewed>) {
    setItems((list) => (list ? list.map((it) => (it.key === key ? { ...it, ...patch } : it)) : list));
  }

  async function acceptAll() {
    if (!items) return;
    const chosen = items.filter((it) => it.accepted && it.title.trim());
    let tasks = 0;
    let events = 0;
    for (const it of chosen) {
      if (it.kind === "event") {
        await addEvent({ date: it.dueDate ?? todayISO(), title: it.title, start: "09:00", end: "10:00", source: "manual" });
        events++;
        continue;
      }
      const id = await addTask({
        title: it.title.trim(),
        course: it.course?.trim() || undefined,
        dueDate: it.dueDate || undefined,
        estimatedMinutes: Math.max(5, Math.round(it.estimatedMinutes / 5) * 5),
        difficulty: clampLevel(it.difficulty),
        importance: clampLevel(it.importance),
        needsCommunication: it.needsCommunication
      });
      if (it.estimatedMinutes > 25) {
        const task = await db.tasks.get(id);
        if (task) await addSubtasks(generateSubtasks(task));
      }
      tasks++;
    }
    toast(`Added ${tasks} task${tasks === 1 ? "" : "s"}${events ? ` and ${events} event${events === 1 ? "" : "s"}` : ""}`);
    setItems(null);
    setText("");
    setImage(null);
    navigate("/tasks");
  }

  const highlighted = useMemo(() => {
    if (!items || !text) return null;
    const spans = items.filter((it) => it.accepted && it.sourceSpan && text.includes(it.sourceSpan)).map((it) => it.sourceSpan);
    if (spans.length === 0) return null;
    const parts: { t: string; hit: boolean }[] = [];
    let rest = text;
    while (rest.length > 0) {
      let best: { idx: number; span: string } | null = null;
      for (const sp of spans) {
        const idx = rest.indexOf(sp);
        if (idx >= 0 && (!best || idx < best.idx)) best = { idx, span: sp };
      }
      if (!best) {
        parts.push({ t: rest, hit: false });
        break;
      }
      if (best.idx > 0) parts.push({ t: rest.slice(0, best.idx), hit: false });
      parts.push({ t: best.span, hit: true });
      rest = rest.slice(best.idx + best.span.length);
    }
    return parts;
  }, [items, text]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <SectionTitle>Paste text or add a photo</SectionTitle>
        <p className="text-soft">
          A syllabus, a Canvas page, an email thread, a photo of your planner or the whiteboard. Pace pulls out the tasks and dates and shows you where each one came from. Only what you paste here is sent.
        </p>
        <Field label="Paste text">
          <textarea
            className="input min-h-40"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Unit 4 reading due Thursday\nLab report draft Fri 10/9\nQuiz on ch. 12 next Monday…"}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <ImageIcon aria-hidden="true" size={17} />
            {image ? "Change photo" : "Add a photo"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
          {image && (
            <span className="inline-flex items-center gap-2 text-[0.9rem] text-soft">
              <img src={image} alt="" className="h-10 w-10 rounded-md object-cover" />
              {imageName}
              <button type="button" className="text-danger" onClick={() => setImage(null)} aria-label="Remove photo">
                <X aria-hidden="true" size={16} />
              </button>
            </span>
          )}
        </div>
        <Button size="lg" onClick={extract} disabled={busy || (!text.trim() && !image)}>
          <Sparkles aria-hidden="true" size={18} />
          {busy ? progress : "Read it"}
        </Button>
        {error && <p className="text-[0.92rem] text-danger">{error}</p>}
        {highlighted && (
          <div>
            <Eyebrow className="mb-1">Where each one came from</Eyebrow>
            <p className="whitespace-pre-wrap rounded-[0.875rem] bg-surface-2 p-3 text-[0.92rem] leading-relaxed">
              {highlighted.map((p, i) =>
                p.hit ? (
                  <mark key={i} className="rounded bg-tint px-0.5 text-tint-ink">
                    {p.t}
                  </mark>
                ) : (
                  <span key={i}>{p.t}</span>
                )
              )}
            </p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionTitle>What Pace found</SectionTitle>
          {items && <Eyebrow>{items.filter((i) => i.accepted).length} selected</Eyebrow>}
        </div>
        {!items && !busy && <p className="text-soft">The list appears here. Edit anything, untick anything, then add.</p>}
        {busy && <p className="text-soft">{progress}</p>}
        {items && items.length === 0 && <p className="text-soft">Nothing that looked like an assignment. {note}</p>}
        {items && items.length > 0 && (
          <>
            {note && <p className="text-[0.9rem] text-soft">{note}</p>}
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.key} className={`card p-3 ${it.accepted ? "" : "border-dashed bg-surface-2"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="checkbox mt-1" checked={it.accepted} onChange={(e) => update(it.key, { accepted: e.target.checked })} aria-label={`Include ${it.title}`} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <input className="input mt-0 font-medium" value={it.title} onChange={(e) => update(it.key, { title: e.target.value })} aria-label="Title" />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[0.85rem] text-soft">
                          Due {it.confidence.dueDate < 0.6 && <Chip tone="warn">guess</Chip>}
                          <input type="date" className="input mt-1" value={it.dueDate ?? ""} onChange={(e) => update(it.key, { dueDate: e.target.value || null })} />
                        </label>
                        <label className="block text-[0.85rem] text-soft">
                          Class {it.confidence.course < 0.6 && <Chip tone="warn">guess</Chip>}
                          <input className="input mt-1" value={it.course ?? ""} onChange={(e) => update(it.key, { course: e.target.value || null })} list="capture-courses" />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[0.85rem]">
                        <Chip tone={it.kind === "event" ? "neutral" : "brand"}>{it.kind === "event" ? "fixed event" : "task"}</Chip>
                        <Chip>
                          ~{minutesLabel(it.estimatedMinutes)}
                          {it.estimateLow !== it.estimateHigh ? ` (${it.estimateLow}–${it.estimateHigh})` : ""}
                        </Chip>
                        {it.dueDate && <Chip>{formatDueLabel(it.dueDate)}</Chip>}
                        <button type="button" className="ml-auto text-soft hover:text-danger" onClick={() => setItems((l) => (l ? l.filter((x) => x.key !== it.key) : l))} aria-label={`Remove ${it.title}`}>
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <datalist id="capture-courses">
              {(courses ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Button size="lg" onClick={acceptAll} disabled={items.every((i) => !i.accepted)}>
              <Check aria-hidden="true" size={18} />
              Add {items.filter((i) => i.accepted).length} to my tasks
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function clampLevel(n: number): Level {
  return Math.min(5, Math.max(1, Math.round(n))) as Level;
}

/** Resize to at most 1600px on the long side so uploads stay small. */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* Calendar feed */

function FeedTab() {
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  async function connect() {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addFeed(url);
      setLast(`${r.label}: ${r.added} new task${r.added === 1 ? "" : "s"}, ${r.updated} updated, ${r.events} fixed event${r.events === 1 ? "" : "s"}.`);
      setUrl("");
      toast("Calendar connected");
    } catch (e) {
      setError(e instanceof FeedError ? e.message : "Couldn't connect that feed.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const results = await syncAllFeeds();
      const added = results.reduce((s, r) => s + r.added, 0);
      const updated = results.reduce((s, r) => s + r.updated, 0);
      setLast(`Synced. ${added} new, ${updated} updated.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <SectionTitle>Connect a calendar feed</SectionTitle>
        <p className="text-soft">
          Paste the private feed link once and Pace keeps your assignments and fixed events current, so there is nothing to type on day two.
        </p>
        <Field label="Feed link" hint="Starts with https or webcal. Pace fetches it through its own server and stores nothing there.">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://school.instructure.com/feeds/calendars/user_….ics" autoComplete="off" />
        </Field>
        <Button size="lg" onClick={connect} disabled={busy || !url.trim()}>
          <Link2 aria-hidden="true" size={18} />
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {error && <p className="text-[0.92rem] text-danger">{error}</p>}
        {last && <p className="text-[0.92rem] text-good">{last}</p>}
        <details className="text-[0.9rem] text-soft">
          <summary className="cursor-pointer font-medium text-brand-deep">Where do I find the link?</summary>
          <ul className="mt-2 space-y-1.5">
            <li><span className="font-medium text-ink">Canvas:</span> Calendar → Calendar Feed (bottom right) → copy the link.</li>
            <li><span className="font-medium text-ink">Google Calendar:</span> Settings → your calendar → Integrate calendar → Secret address in iCal format.</li>
          </ul>
          <p className="mt-2">Treat the link like a password: anyone with it can read that calendar.</p>
        </details>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between">
          <SectionTitle>Connected</SectionTitle>
          {(profile?.feeds?.length ?? 0) > 0 && (
            <Button variant="ghost" size="sm" onClick={syncNow} disabled={busy}>
              <RefreshCw aria-hidden="true" size={15} className={busy ? "animate-spin" : ""} />
              Sync now
            </Button>
          )}
        </div>
        {(profile?.feeds?.length ?? 0) === 0 ? (
          <p className="mt-2 text-soft">No feeds yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {profile!.feeds!.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-[0.875rem] border border-line px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{f.label ?? "Calendar"}</span>
                  <span className="block truncate text-[0.85rem] text-soft">
                    {f.lastSyncedAt ? `synced ${new Date(f.lastSyncedAt).toLocaleString()}` : "not synced yet"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await removeFeed(f.id, false);
                    toast("Feed removed. Its tasks stay");
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.85rem] text-soft">Feeds sync when you open Pace, at most every six hours. Removing a feed keeps the tasks it added.</p>
      </Card>
    </div>
  );
}
