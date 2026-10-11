# Pace

A planner that plans around how you actually feel.

I developed Pace as a planner for students returning to schoolwork after an illness, concussion, family emergency, burnout, or another disruption. The app lets students choose how much they can manage today and selects steps that fit. Each step includes a reason, and unfinished work can wait without counting against them.

Live: [planwithpace.app](https://planwithpace.app/) · Planner walkthrough: [planwithpace.app/how](https://planwithpace.app/how)

To try Pace, open the app and move the dial on the landing page. The plan adjusts as you move it. Select Start to continue.

---

## Capacity and the Day Line

I designed Pace around a capacity dial from 0 to 100, which sets the day's minute budget, maximum step length, and number of steps. The Day Line shows those steps as stops along a path and updates as the dial moves. Low-capacity days allow up to three short steps; days with more capacity allow longer blocks. Unfinished steps do not turn red.

## What it does

I built the following features to support planning, focused work, and a return to schoolwork:

- Check in with the dial. Optionally choose available parts of the day, work that feels heavy, a hard time cap, or "not sure, start me gently."
- Get an immediate plan from the on-device engine, which uses exact knapsack selection over explicit scores. A language model then proposes task-specific steps with reasons and a concrete first action. A deterministic validator checks task and step IDs, sequence, budget, and the message-step cap. The local draft remains available when the model is slow, unreachable, or over its allowance.
- Work through one step at a time in Focus mode with a count-up timer. Mark it done, report that it is taking longer, or stop. Recorded time helps calibrate estimates.
- Adjust the rest of the day with an instruction such as "Nothing with reading tonight, 40 minutes." Completed steps stay in the plan.
- Add tasks through quick-add, a full form, pasted text, or a photo. Extraction includes confidence for each field and highlights the source text. Canvas and Google Calendar feed links keep assignments and fixed events current.
- Break assignments into task-specific steps, each with a first action. Templates handle breakdowns when AI is off.
- Draft teacher messages from a neutral reason phrase, specific requests, a tone, and an optional commitment. Reply mode handles follow-ups. A lint check flags wording that explains more than it needs to and offers neutral phrasing; Pace does not send the message itself.
- Review seven small Day Lines in Week: past progress, upcoming deadlines and fixed events, workload compared with realistic capacity, and messages that could unblock work.
- See learned estimates in Insights: actual-to-estimated minutes by class and work type, completion rates by part of day, and the reflection multiplier. These are calculated on the device and can be reset with one button.
- Choose light, dark, or high contrast, with larger text and reduced motion options. The app supports keyboard navigation, native inputs, and live regions. Ctrl+K or ⌘K opens the command palette.

## Privacy

I designed Pace to work without an account. I do not use analytics or externally hosted scripts, and I host the fonts with the app. Pace stores tasks, plans, and settings in IndexedDB in your browser. Settings provides controls to export, import, or delete that data.

For AI planning, I send task details, steps, your check-in, available time, fixed events, and short learned facts through a serverless function to the model provider. Replanning also includes completed steps and the instruction entered. I exclude private task notes, your profile name, and raw reflection records from planning requests and set `store: false`. If the planner is unreachable, the local engine handles planning on the device.

I designed Pace to support a return to schoolwork without requiring an explanation of what happened.

Further details are available in the [privacy policy](https://planwithpace.app/privacy.html).

## How I structured the planner

I organized planning around the following sequence:

```
check-in ─► Context Builder ─► language model ─► Validator ─► Day Line
                 │                                        ▲
                 └─► local engine: score → exact knapsack → fill → place ──┘ (instant draft + fallback)
```

1. The dial maps to a base minute budget and maximum step length through monotonic, piecewise-linear curves. The base budget is 15 minutes at 0, 90 at 62, and 200 at 100; the maximum step length ranges from 10 to 60 minutes. Low-, medium-, and high-capacity plans allow up to 3, 5, and 6 starting steps, respectively, with up to 0, 3, and 4 follow-on steps.
2. The local engine considers the earliest unfinished step of each task. It divides oversized steps into shorter chunks or replaces them with a starting step. Message steps are exempt from sequence and capped at one, or two on high-capacity days.
3. Each candidate receives a score: urgency×1.5 + importance×1.2 + message boost + capacity fit + quick-win bonus, minus a penalty for work marked heavy today. The same factors supply the "why now" explanation.
4. An exact bounded knapsack solver selects the highest-scoring combination within the minute budget and starting-step limit, then works backward to identify the selected steps. Choosing the highest-scoring step first can produce a worse combination.
5. The engine adds subsequent steps from selected tasks while the budget and follow-on limit allow, then places them in the student's available time windows.
6. The model receives a bounded JSON context and returns a strict JSON response containing reasoning, actions, and deferred tasks. The validator drops unknown IDs and out-of-order steps, limits step lengths, and trims proposals that exceed the budget using the same knapsack solver with a preference for the model's suggested order. It also caps messages and adjusts windows. Internal correction counts are used in the evaluation suite and are not shown to students.
7. The app learns median actual-to-estimated time ratios by class and work type, with estimates pulled toward a ratio of 1.0 when data is limited. Calibration applies after at least three samples. It also tracks completion rates by part of day. Reflections adjust the budget multiplier: ×0.85 for lighter, ×1.12 for heavier, and a return toward neutral for the same workload, bounded between 0.5 and 1.5.

The `/how` walkthrough runs this code on a sample backlog.

## Stack

I built Pace with React, strict TypeScript, Vite, and Tailwind CSS with OKLCH tokens. Motion handles animation, while React Aria Components and cmdk provide accessible controls and the command palette. Dexie wraps IndexedDB, and the client and server share Zod schemas.

I use the OpenAI SDK for structured outputs and streaming through Vercel serverless functions, and vite-plugin-pwa for the PWA. I check the app with Vitest, Playwright with axe-core, and Lighthouse CI.

## Running it

```bash
npm install
npm run dev          # app + API at http://localhost:5173 (mock AI unless configured)
npm test             # unit tests: capacity model, scheduler, validator, Day Line layout, parser, lint, learning, ICS
npm run e2e          # Playwright journeys + axe on every route in three themes
npm run build        # typecheck + production build
```

## License

MIT
