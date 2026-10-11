# Pace architecture

This document describes how I organized Pace, with file references for checking the implementation.

## System overview

```
┌──────────────────────────── browser (PWA, React) ────────────────────────────────┐
│                                                                                  │
│  screens ──► usePlanner / useAIPlan ──► local engine (logic/)  ──► Day Line      │
│                     │                        ▲                                   │
│                     │ builds bounded context │ validator (logic/validate.ts)     │
│                     ▼                        │                                   │
│               ai/client.ts  ── SSE ──►  api/plan.ts  ──►  OpenAI Responses API   │
│                                              (stateless Vercel function)         │
│  Dexie (IndexedDB): tasks, subtasks, checkIns, plans, sessions, events,          │
│                     reflections, settings, profile                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Screens read from IndexedDB through live queries. The app remains usable offline and with AI off.

I keep model output separate from database writes. A deterministic validator checks each proposal against the supplied IDs, step order, and budget before the app saves it.

I share the Zod schemas in `src/shared/schema.ts` between the browser, serverless functions, and evaluation suite. Those schemas also define the model's strict JSON output format.

## Capacity model (`src/logic/capacity.ts`)

The dial is an integer from 0 to 100. Three piecewise-linear, monotonic curves map it to:

| Output | 0 | 35 | 62 | 85 | 100 |
|---|---|---|---|---|---|
| budget (min) | 15 | 45 | 90 | 150 | 200 |
| longest step (min) | 10 | ~17 | 35 | ~52 | 60 |
| actions (+ follow-on) | 3 | 3 | 5 (+3) | 6 (+4) | 6 (+4) |

The low / medium / high / unsure labels remain compatible with existing data and tests. The dial supplies the labels; "not sure" is an explicit choice that keeps planning gentle regardless of the dial. The reflection multiplier in `logic/adaptation.ts` and an optional hard cap adjust the budget. Tests check that the curves are monotonic because the Day Line animates their values.

## Local engine (`src/logic/scheduler.ts`, `scoring.ts`)

I structured the local engine to follow this sequence:

1. It considers the earliest unfinished non-message step of each open task. It chunks steps that exceed today's limit ("Spend 35 min on…"), or replaces them with a starter on low days. Message steps are exempt from sequence and capped at one, or two on high days. Work marked heavy today loses 4 points.
2. It scores candidates with `urgency×1.5 + importance×1.2 + message + fit + quickWin` and keeps each factor for the "why now" explanation.
3. It selects candidates with exact bounded knapsack. `dp[i][c][m]` stores the best score using the first *i* candidates with at most *c* actions and *m* minutes; reconstruction walks backwards. The table is bounded at 80 candidates × 240 minutes × 6 actions and runs in well under a millisecond.
4. On medium and high days, it adds each selected task's next steps in sequence while the budget allows.
5. It orders messages first, then work by urgency, keeping each task's steps together. `placeInWindows` distributes minutes proportionally across available windows.
6. It uses `logic/narrate.ts` for a short explanation when AI is off.

## AI layer

### Client (`src/ai/`)

- `planner.ts` builds a bounded request containing up to 40 open tasks with steps, the check-in, dial-derived limits, today's fixed events, and `learned` sentences from the profile. It excludes notes.
- `client.ts` reads server-sent events, validates the final object with the shared schema, and maps failures to typed codes such as `plan_limit`, `reauth`, and `no_provider`. `partialReasoning()` extracts the paragraph from incomplete streamed JSON so the screen can display it as it arrives.
- `useAIPlan.ts` saves the local draft immediately, then replaces it with the validated model plan. On failure, it keeps the local plan and shows a one-line notice.

### Validator (`src/logic/validate.ts`)

The validator first drops unknown or finished IDs. It checks sequence: a step's unfinished predecessors must be done or appear earlier in the plan. It then clamps minutes to the block limit and caps messages.

If the proposal exceeds the budget or action cap, the knapsack solver trims it, using model order as a tie-breaker. The validator checks sequence again after trimming and moves steps out of unavailable windows. Repair notes are returned as strings for the eval suite and are never shown to students.

### Server (`api/`)

- `_lib/provider.ts` resolves credentials: `key` (OPENAI_API_KEY), `plan` (local token file from Sign in with ChatGPT), `mock` (PACE_AI_MOCK=1), or `none`.
- `_lib/run.ts` makes one streaming Responses API call with `reasoning.effort`, `store: false`, and a strict `text.format` from the Zod schema. Plan mode forbids output caps and user identifiers, so those are only sent in key mode. If the provider rejects structured outputs (`subscription_sharing_unsupported_capability`), it retries with the schema in the prompt and validates the JSON itself.
- `_lib/handler.ts` handles the shared request flow. `plan.ts`, `breakdown.ts`, `extract.ts`, and `message.ts` supply their schemas, prompts, and reasoning effort.
- `auth.ts` implements OpenAI's open-source token-sharing flow (dynamic client registration, PKCE, loopback callback) for development on a local machine. The hosted site never uses it.
- `feed.ts` fetches a Canvas or Google Calendar feed because browsers block the cross-origin read. It allow-lists hosts, rejects private addresses, caps size, and stores nothing.
- `health.ts` reports the mode and, on request, the models the credential can use.

During development, the plugin in `vite.config.ts` serves these functions with the same Web `Request`/`Response` interface used by Vercel and mounts `/callback`.

## Learning (`src/logic/learning.ts`)

- Calibration uses the median actual/estimated minute ratio from finished sessions, grouped by course and work type. A pseudo-count of 2 shrinks ratios toward 1.0. Adjustments apply only with three or more samples and are clamped to [0.33, 3].
- Energy is the completion rate by part of day, with add-one smoothing.
- The budget multiplier comes from reflections. Insights shows it alongside its history.

After each focus session, the app recomputes these values and stores them in `profile`. Insights displays them, and the planner receives them as sentences. One button clears the learned values.

## Day Line (`src/logic/dayline.ts`, `components/DayLine.tsx`)

`layoutDayLine()` calculates the geometry without React or DOM access. It compresses the budget-to-horizon mapping so short days remain legible, places stops proportionally with even spacing as a fallback, and calculates the completed portion, window marks, and spare minutes.

Paths use a fixed sample count so their `d` attributes can interpolate. The component uses spring animations and respects reduced motion through `MotionConfig`. The hero, compact strip, and week thumbnails all use the same component.

## Data (`src/data/`)

Dexie stores `sessions`, `events`, and `profile` alongside the other tables, with optional fields on existing records. Older records remain readable without changes. Imports validate before merging in one transaction.

Capture, task breakdown, and feed sync all write through the repository functions. This keeps task auto-completion and progress preservation consistent across entry points.

## Privacy boundary

`public/privacy.html` lists the data each feature sends off the device and matches the request schemas. The serverless layer is stateless and does not log data. Requests use `store: false`. A single setting turns AI off.

## Checks

I use these checks to verify the implementation:

- Unit tests (`src/tests/`): capacity curves, scheduler, validator, Day Line layout, quick-add parser, ICS parser, learning estimators, lint, narration, import validation.
- Evals (`evals/`): twelve golden scenarios through the local engine and the mock planner with hard invariants; with `PACE_EVAL_LIVE=1`, the live model with a small rubric and the repair rate.
- End-to-end (`e2e/`): Playwright journeys on desktop and phone, axe-core on every route in three themes.
- Lighthouse CI: budgets for the landing page and the explainer.

## Scope

- The app has no server-side storage, accounts, sync, or sharing. Export and import handle moving data between devices.
- Week shows progress without streaks, badges, red counters, or a score.
- The adjust box accepts one instruction and replans through the validator. It does not provide open-ended chat.
