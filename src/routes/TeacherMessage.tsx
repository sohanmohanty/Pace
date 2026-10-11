import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "react-router-dom";
import { Copy, Mail, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { ai, AIError } from "../ai/client";
import { useToast } from "../components/Toast";
import { Button, Card, ChipRadios, Field, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { getSettings, updateSettings } from "../data/repo";
import { daysUntil, formatShort } from "../lib/dates";
import { lintMessage, neutralize } from "../logic/lint";
import { usePersistedState } from "../lib/persistedState";
import { REASONS, REQUESTS, TONES, type ToneId } from "../logic/messages";

/** Share an in-flight draft request across mounts so navigation does not discard it. */
let draftJob: Promise<{ subject: string; body: string }> | null = null;

function describeError(e: unknown): string {
  return e instanceof AIError && e.code === "no_provider"
    ? "The planner isn't connected on this server, so nothing can be drafted here."
    : "Couldn't draft right now. Try again in a moment.";
}

// Draft a teacher message from a neutral reason, requests, tone, and an
// optional commitment. Check for disclosure before copying. Pace does not
// send messages.
export function TeacherMessage() {
  const [params] = useSearchParams();
  const toast = useToast();

  const settings = useLiveQuery(() => getSettings(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);

  // Preserve form text in sessionStorage across navigation. An in-flight
  // draft continues in the background.
  const [teacherName, setTeacherName] = usePersistedState("msg.teacher", "");
  const [course, setCourse] = usePersistedState("msg.course", params.get("course") ?? "");
  const [reasonId, setReasonId] = usePersistedState("msg.reason", "none");
  const [requestIds, setRequestIds] = usePersistedState<string[]>("msg.requests", ["priorities"]);
  const [commitment, setCommitment] = usePersistedState("msg.commitment", "");
  const [tone, setTone] = usePersistedState<ToneId>("msg.tone", "straightforward");
  const [studentName, setStudentName] = useState("");
  const [replyTo, setReplyTo] = usePersistedState("msg.replyTo", "");
  const seededName = useRef(false);

  const [draft, setDraft] = usePersistedState<{ subject: string; body: string } | null>("msg.draft", null);
  const [edited, setEdited] = usePersistedState<string | null>("msg.edited", null);
  const [drafting, setDrafting] = useState(() => Boolean(draftJob));
  const [draftError, setDraftError] = useState<string | null>(null);

  // Rejoin a draft that was started before navigating away.
  useEffect(() => {
    if (!draftJob) return;
    let alive = true;
    draftJob.then(
      (r) => {
        if (!alive) return;
        setDraft(r);
        setDrafting(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setDraftError(describeError(e));
        setDrafting(false);
      }
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings && !seededName.current) {
      seededName.current = true;
      setStudentName(settings.studentName ?? "");
    }
  }, [settings]);

  const courses = useMemo(
    () => [...new Set((tasks ?? []).map((t) => t.course).filter(Boolean))] as string[],
    [tasks]
  );
  const about = params.get("about");

  const message = edited ?? draft?.body ?? "";
  const hits = useMemo(() => lintMessage(message), [message]);

  function suggestCommitment() {
    const open = (tasks ?? [])
      .filter((t) => !t.archived && t.status !== "done")
      .filter((t) => (course ? t.course === course : true))
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .slice(0, 2);
    const relevant = about
      ? open.filter((t) => t.title === about).concat(open.filter((t) => t.title !== about)).slice(0, 2)
      : open;
    if (relevant.length === 0) return;
    setCommitment(
      relevant
        .map((t) => {
          if (!t.dueDate) return `finish ${t.title} this week`;
          return daysUntil(t.dueDate) <= 0
            ? `finish ${t.title} in the next few days`
            : `finish ${t.title} by ${formatShort(t.dueDate)}`;
        })
        .join(", then ")
    );
  }

  async function draftWithAI() {
    if (drafting) return;
    setDrafting(true);
    setDraftError(null);
    setEdited(null);
    try {
      const reason = REASONS.find((r) => r.id === reasonId)?.phrase ?? "";
      const requests = requestIds
        .map((id) => REQUESTS.find((r) => r.id === id)?.phrase)
        .filter((x): x is string => Boolean(x));
      const relevant = (tasks ?? [])
        .filter((t) => !t.archived && t.status !== "done")
        .filter((t) => (course ? t.course === course : true))
        .slice(0, 4)
        .map((t) => ({ title: t.title, dueDate: t.dueDate ?? null }));
      const job = ai
        .message({
          teacherName: teacherName || null,
          course: course || null,
          reason,
          requests,
          commitment: commitment || null,
          tone,
          studentName: studentName || null,
          replyTo: replyTo.trim() || null,
          relevantTasks: relevant
        })
        .then(({ result }) => ({ subject: result.subject, body: result.body }))
        .finally(() => {
          if (draftJob === job) draftJob = null;
        });
      draftJob = job;
      const result = await job;
      setDraft(result);
    } catch (e) {
      setDraftError(describeError(e));
    } finally {
      setDrafting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Copied. Paste it into email or your LMS");
    } catch {
      toast("Couldn't copy automatically. Select the text instead");
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(
    draft?.subject ?? (course ? `Catching up in ${course}` : "Catching up")
  )}&body=${encodeURIComponent(message)}`;

  function toggleRequest(id: string) {
    setRequestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageHeader title="Teacher message" />
      </div>

      <Card className="min-w-0 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teacher">
            <input className="input" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Mr. Chen" />
          </Field>
          <Field label="Class" hint="optional">
            <input className="input" value={course} onChange={(e) => setCourse(e.target.value)} list="msg-courses" placeholder="Biology" />
            <datalist id="msg-courses">
              {courses.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <fieldset>
          <legend className="font-medium">Reason line</legend>
          <div className="mt-2 space-y-1.5">
            {REASONS.map((r) => (
              <label
                key={r.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[0.875rem] border-[1.5px] px-3.5 py-2 ${
                  reasonId === r.id ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input type="radio" name="reason" className="checkbox !h-5 !w-5 !rounded-full" checked={reasonId === r.id} onChange={() => setReasonId(r.id)} />
                <span className={reasonId === r.id ? "font-medium text-brand-deep" : ""}>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-medium">What are you asking for?</legend>
          <div className="mt-2 space-y-1.5">
            {REQUESTS.map((r) => (
              <label
                key={r.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[0.875rem] border-[1.5px] px-3.5 py-2 ${
                  requestIds.includes(r.id) ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input type="checkbox" className="checkbox !h-5 !w-5" checked={requestIds.includes(r.id)} onChange={() => toggleRequest(r.id)} />
                <span className={requestIds.includes(r.id) ? "font-medium text-brand-deep" : ""}>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="What you can commit to">
          <textarea className="input" rows={2} value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="finish the lab outline today and the report by Friday" />
        </Field>
        <Button variant="ghost" size="sm" onClick={suggestCommitment}>
          Suggest from my tasks
        </Button>

        <ChipRadios legend="Tone" name="tone" options={TONES.map((t) => ({ value: t.id, label: t.label }))} value={tone} onChange={(v) => setTone(v)} />

        <Field label="Sign as">
          <input
            className="input"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onBlur={() => updateSettings({ studentName: studentName || undefined })}
            placeholder="Your name"
          />
        </Field>

        <Field label="Replying to something?">
          <textarea className="input" rows={3} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Paste their reply here" />
        </Field>

        <Button size="lg" onClick={draftWithAI} disabled={drafting}>
          <Sparkles aria-hidden="true" size={18} />
          {drafting ? "Drafting…" : draft ? "Draft it again" : "Draft it for me"}
        </Button>
        {draftError && <p className="text-[0.9rem] text-danger">{draftError}</p>}
      </Card>

      <Card className="min-w-0 lg:sticky lg:top-8">
        <SectionTitle>Your message</SectionTitle>
        {!draft ? (
          <p className="mt-3 text-soft">
            {drafting
              ? "Drafting…"
              : "Choose what you need on the left and press Draft it for me. The message appears here, ready to edit and copy."}
          </p>
        ) : (
          <>
            <p className="mt-2 text-[0.9rem] text-soft">
              Subject: <span className="font-medium text-ink">{draft.subject}</span>
            </p>
            <textarea
              className="input mt-3 min-h-56 whitespace-pre-wrap bg-bg font-sans text-[0.98rem] leading-relaxed"
              value={message}
              onChange={(e) => setEdited(e.target.value)}
              aria-label="Message text"
            />
            <div
              className={`mt-2 flex items-start gap-2 rounded-[0.75rem] px-3 py-2 text-[0.9rem] ${hits.length ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}
              aria-live="polite"
            >
              <ShieldCheck aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
              {hits.length === 0 ? (
                <span>Nothing in here shares what happened.</span>
              ) : (
                <span>
                  This mentions {hits.map((h) => `“${h.term}”`).join(", ")}. You can send it as is, or{" "}
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => setEdited(neutralize(message))}>
                    <Wand2 aria-hidden="true" size={13} className="mr-0.5 inline" />
                    swap in neutral wording
                  </button>
                  .
                </span>
              )}
            </div>
            <div className="mt-4 space-y-2">
              <Button size="lg" onClick={copy}>
                <Copy aria-hidden="true" size={18} />
                Copy message
              </Button>
              <a
                href={mailto}
                className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-[1rem] border-[1.5px] border-line bg-surface px-5 text-[1.05rem] font-medium text-ink hover:bg-surface-2"
              >
                <Mail aria-hidden="true" size={18} />
                Open in email app
              </a>
            </div>
            <p className="mt-3 text-[0.9rem] text-soft">Pace never sends anything for you.</p>
          </>
        )}
      </Card>
    </div>
  );
}
