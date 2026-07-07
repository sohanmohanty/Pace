import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "react-router-dom";
import { Copy, Mail } from "lucide-react";
import { useToast } from "../components/Toast";
import { Button, Card, ChipRadios, Field, PageHeader, SectionTitle } from "../components/ui";
import { db } from "../data/db";
import { getSettings, updateSettings } from "../data/repo";
import { daysUntil, formatShort } from "../lib/dates";
import {
  composeMessage,
  REASONS,
  REQUESTS,
  TONES,
  type ToneId
} from "../logic/messages";

export function TeacherMessage() {
  const [params] = useSearchParams();
  const toast = useToast();

  const settings = useLiveQuery(() => getSettings(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);

  const [teacherName, setTeacherName] = useState("");
  const [course, setCourse] = useState(params.get("course") ?? "");
  const [reasonId, setReasonId] = useState("none");
  const [requestIds, setRequestIds] = useState<string[]>(["priorities"]);
  const [commitment, setCommitment] = useState("");
  const [tone, setTone] = useState<ToneId>("straightforward");
  const [studentName, setStudentName] = useState("");
  const seededName = useRef(false);

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

  const message = composeMessage({
    teacherName,
    course: course || undefined,
    reasonId,
    requestIds,
    commitment: commitment || undefined,
    tone,
    studentName: studentName || undefined
  });

  function suggestCommitment() {
    const open = (tasks ?? [])
      .filter((t) => !t.archived && t.status !== "done")
      .filter((t) => (course ? t.course === course : true))
      .sort((a, b) => (a.dueDate ?? "9999") .localeCompare(b.dueDate ?? "9999"))
      .slice(0, 2);
    const relevant = about
      ? open.filter((t) => t.title === about).concat(open.filter((t) => t.title !== about)).slice(0, 2)
      : open;
    if (relevant.length === 0) return;
    setCommitment(
      relevant
        .map((t) => {
          if (!t.dueDate) return `finish ${t.title} this week`;
          // Never suggest committing to a date that's already passed.
          return daysUntil(t.dueDate) <= 0
            ? `finish ${t.title} in the next few days`
            : `finish ${t.title} by ${formatShort(t.dueDate)}`;
        })
        .join(", then ")
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Copied — paste it into email or your LMS");
    } catch {
      toast("Couldn't copy automatically — select the text instead");
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(
    course ? `Catching up in ${course}` : "Catching up"
  )}&body=${encodeURIComponent(message)}`;

  function toggleRequest(id: string) {
    setRequestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageHeader
          title="Teacher message"
          subtitle="Say what you need without explaining what happened. You choose every word that goes in."
        />
      </div>

      <Card className="min-w-0 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teacher">
            <input
              className="input"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Mr. Chen"
            />
          </Field>
          <Field label="Class" hint="optional">
            <input
              className="input"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              list="msg-courses"
              placeholder="Biology"
            />
            <datalist id="msg-courses">
              {courses.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <fieldset>
          <legend className="font-medium">Reason line</legend>
          <p className="mt-0.5 text-[0.9rem] text-soft">
            All of these are enough. None of them shares details.
          </p>
          <div className="mt-2 space-y-1.5">
            {REASONS.map((r) => (
              <label
                key={r.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2 ${
                  reasonId === r.id ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  className="checkbox !h-5 !w-5 !rounded-full"
                  checked={reasonId === r.id}
                  onChange={() => setReasonId(r.id)}
                />
                <span className={reasonId === r.id ? "font-medium text-brand-deep" : ""}>
                  {r.label}
                </span>
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
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2 ${
                  requestIds.includes(r.id) ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input
                  type="checkbox"
                  className="checkbox !h-5 !w-5"
                  checked={requestIds.includes(r.id)}
                  onChange={() => toggleRequest(r.id)}
                />
                <span className={requestIds.includes(r.id) ? "font-medium text-brand-deep" : ""}>
                  {r.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="What you can commit to" hint="Optional — a plan builds trust.">
          <textarea
            className="input"
            rows={2}
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
            placeholder="finish the lab outline today and the report by Friday"
          />
        </Field>
        <Button variant="ghost" size="sm" onClick={suggestCommitment}>
          Suggest from my tasks
        </Button>

        <ChipRadios
          legend="Tone"
          name="tone"
          options={TONES.map((t) => ({ value: t.id, label: t.label }))}
          value={tone}
          onChange={(v) => setTone(v)}
        />

        <Field label="Sign as" hint="Optional. Stored only on this device.">
          <input
            className="input"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onBlur={() => updateSettings({ studentName: studentName || undefined })}
            placeholder="Your name"
          />
        </Field>
      </Card>

      <Card className="min-w-0 lg:sticky lg:top-8">
        <SectionTitle>Preview</SectionTitle>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-bg p-4 font-sans text-[0.98rem] leading-relaxed">
          {message}
        </pre>
        <div className="mt-4 space-y-2">
          <Button size="lg" onClick={copy}>
            <Copy aria-hidden="true" size={18} />
            Copy message
          </Button>
          <a
            href={mailto}
            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-line bg-surface px-5 text-lg font-medium text-ink hover:bg-bg"
          >
            <Mail aria-hidden="true" size={18} />
            Open in email app
          </a>
        </div>
        <p className="mt-3 text-[0.9rem] text-soft">
          Pace never sends anything for you — you stay in control.
        </p>
      </Card>
    </div>
  );
}
