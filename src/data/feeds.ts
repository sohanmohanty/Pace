// Sync Canvas or Google Calendar links into tasks and fixed events. Feed
// IDs let later syncs update existing items. Fetch through the serverless
// endpoint to avoid browser cross-origin restrictions; it stores no feed data.

import { db } from "./db";
import { getProfile, updateProfile } from "./repo";
import type { FixedEvent, Task } from "./types";
import { todayISO } from "../lib/dates";
import { uid } from "../lib/id";
import { filterWindow, guessImportance, guessMinutes, parseIcs, type IcsItem } from "../logic/ics";

export interface SyncResult {
  added: number;
  updated: number;
  events: number;
  skipped: number;
  label?: string;
}

export class FeedError extends Error {}

export async function fetchFeedText(url: string): Promise<string> {
  const response = await fetch("/api/feed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!response.ok) {
    let message = `Couldn't fetch the feed (${response.status}).`;
    try {
      const errorBody = (await response.json()) as { message?: string };
      message = errorBody.message ?? message;
    } catch {
      /* keep */
    }
    throw new FeedError(message);
  }
  return response.text();
}

export function labelForFeed(url: string): string {
  try {
    const feedUrl = new URL(url.replace(/^webcal:\/\//i, "https://"));
    if (/instructure|canvas/i.test(feedUrl.hostname)) return "Canvas";
    if (/google/i.test(feedUrl.hostname)) return "Google Calendar";
    return feedUrl.hostname;
  } catch {
    return "Calendar feed";
  }
}

/** Save parsed feed items locally without network calls; accepts parsed lists for testing. */
export async function applyFeedItems(feedId: string, items: IcsItem[], today = todayISO()): Promise<SyncResult> {
  const now = new Date().toISOString();
  const inWindow = filterWindow(items, today);
  let added = 0;
  let updated = 0;
  let events = 0;
  let skipped = 0;

  await db.transaction("rw", db.tasks, db.events, async () => {
    const existingTasks = await db.tasks.where("externalId").startsWith(`${feedId}:`).toArray();
    const tasksByExternalId = new Map(existingTasks.map((t) => [t.externalId as string, t]));
    const existingEvents = await db.events.where("externalId").startsWith(`${feedId}:`).toArray();
    const eventsByExternalId = new Map(existingEvents.map((e) => [e.externalId as string, e]));

    for (const item of inWindow) {
      const externalId = `${feedId}:${item.uid}`;
      if (item.kind === "event") {
        if (!item.start) {
          skipped++;
          continue;
        }
        const existing = eventsByExternalId.get(externalId);
        const event: FixedEvent = {
          id: existing?.id ?? uid(),
          date: item.date,
          title: item.title,
          start: item.start,
          end: item.end ?? addMinutes(item.start, 60),
          source: "feed",
          externalId
        };
        await db.events.put(event);
        events++;
        continue;
      }
      const existing = tasksByExternalId.get(externalId);
      if (existing) {
        // Keep the student's edits to size and importance; refresh title, course, and date.
        const patch: Partial<Task> = {};
        if (existing.title !== item.title) patch.title = item.title;
        if (item.course && existing.course !== item.course) patch.course = item.course;
        if (existing.dueDate !== item.date) patch.dueDate = item.date;
        if (Object.keys(patch).length > 0) {
          await db.tasks.update(existing.id, { ...patch, updatedAt: now });
          updated++;
        }
        continue;
      }
      const task: Task = {
        id: uid(),
        title: item.title,
        course: item.course,
        dueDate: item.date,
        estimatedMinutes: guessMinutes(item.title),
        difficulty: 3,
        importance: guessImportance(item.title),
        status: "not_started",
        needsCommunication: false,
        notes: item.url ? item.url : undefined,
        source: "feed",
        externalId,
        createdAt: now,
        updatedAt: now
      };
      await db.tasks.add(task);
      added++;
    }
  });

  return { added, updated, events, skipped };
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function addFeed(url: string): Promise<SyncResult> {
  const clean = url.trim();
  const profile = await getProfile();
  const existing = (profile.feeds ?? []).find((f) => f.url === clean);
  const id = existing?.id ?? uid();
  const text = await fetchFeedText(clean);
  const items = parseIcs(text);
  if (items.length === 0) throw new FeedError("That feed is empty, or not a calendar.");
  const result = await applyFeedItems(id, items);
  const feeds = [...(profile.feeds ?? []).filter((f) => f.id !== id), { id, url: clean, label: labelForFeed(clean), lastSyncedAt: new Date().toISOString() }];
  await updateProfile({ feeds });
  return { ...result, label: labelForFeed(clean) };
}

export async function syncAllFeeds(): Promise<SyncResult[]> {
  const profile = await getProfile();
  const out: SyncResult[] = [];
  for (const f of profile.feeds ?? []) {
    try {
      const text = await fetchFeedText(f.url);
      const result = await applyFeedItems(f.id, parseIcs(text));
      out.push({ ...result, label: f.label });
      f.lastSyncedAt = new Date().toISOString();
    } catch {
      out.push({ added: 0, updated: 0, events: 0, skipped: 0, label: `${f.label ?? "feed"} (failed)` });
    }
  }
  await updateProfile({ feeds: profile.feeds });
  return out;
}

export async function removeFeed(id: string, deleteItems: boolean): Promise<void> {
  const profile = await getProfile();
  await updateProfile({ feeds: (profile.feeds ?? []).filter((f) => f.id !== id) });
  if (deleteItems) {
    await db.transaction("rw", db.tasks, db.events, async () => {
      await db.tasks.where("externalId").startsWith(`${id}:`).delete();
      await db.events.where("externalId").startsWith(`${id}:`).delete();
    });
  }
}

/** Sync at most once every 6 hours, on app open. */
export async function maybeAutoSync(): Promise<void> {
  const profile = await getProfile();
  const feeds = profile.feeds ?? [];
  if (feeds.length === 0) return;
  const last = Math.max(...feeds.map((f) => (f.lastSyncedAt ? new Date(f.lastSyncedAt).getTime() : 0)));
  if (Date.now() - last < 6 * 60 * 60 * 1000) return;
  await syncAllFeeds();
}
