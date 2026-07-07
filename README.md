# Pace

A mobile-first re-entry planning app for students returning from invisible disruptions.

**Live app:** [pace-student.vercel.app](https://pace-student.vercel.app/)

**Try it in ten seconds:** open the app → "Show me some example tasks" → pick how today feels → get a plan.

## Problem

Students who miss school after health-related, personal, or other invisible disruptions come back to a pile-up: overdue work, missed notes, teachers to contact, and no idea how much is realistic today. Traditional productivity tools assume consistent capacity and punish inconsistency with guilt mechanics — streaks, red badges, "13 overdue."

Pace treats inconsistency as a design condition, not a character flaw. It adapts the plan to the student's capacity instead of making the student feel like they failed the plan.

## Features

- **Capacity check-in** — one question a day: "What kind of day is this?" Low / medium / high / not sure.
- **Task input** — a one-line quick-add parser (`bio lab due fri ~2h hard #biology @teacher`) plus a full form; one Tasks screen holds catch-up, upcoming, and finished work.
- **Task breakdown** — templates (essay, test catch-up, reading, project, message) turn big assignments into ordered, editable steps, scaled to the task's size.
- **Adaptive daily plan** — 3–6 actions selected optimally for today's minute budget, each with a "why this?" explanation.
- **Low-capacity mode** — one action at a time, large targets, no backlog wall. "One useful step is enough for now."
- **Teacher-message generator** — neutral reason phrases ("after an unexpected absence"), concrete requests, a commitment line. No diagnosis, ever. Nothing is sent by the app.
- **Reflection log → real adaptation** — "lighter / same / heavier" feedback multiplies the next plan's budget (clamped ×0.5–×1.5, always shown in the UI).
- **Weekly reset** — what happened, what's left, which messages would unlock things. No failure states.
- **Privacy-first local storage** — no account, no server, no trackers. Export, import (merge a backup or move devices), or delete everything, anytime.
- **Responsive** — phone-first with bottom tabs; at desktop widths (≥1024 px) the same app switches to a sidebar layout with two-column screens. Pure CSS breakpoints, no user-agent sniffing — resize the window and it adapts live.
- **Demo mode** — a realistic set of example tasks, tagged and clearable separately from real data.

## Design Principles

1. Capacity-aware planning
2. Privacy without forced disclosure
3. Small steps over guilt
4. Accessibility-first interface
5. Explainable recommendations

## Design Decisions

**Why local-first?** No login friction, no sensitive data in transit, offline by default, and a privacy story that is honest: "Pace does not ask for diagnosis or medical details. Data is stored locally by default. You can delete it anytime."

**Why no AI/LLM?** A deliberate choice, not a gap. Task breakdown, message generation, and planning are deterministic and template-based because (a) a student's backlog should never be sent to a third-party API, (b) every recommendation must be explainable — each plan action carries the exact factors that put it there, and (c) rules are testable; 62 unit tests lock the behavior. A black box that is right 95% of the time is worse here than a transparent system that can always answer "why?"

**Why a scoring + knapsack scheduler instead of ML?** Plan selection is a genuine optimization problem: maximize the value of chosen actions subject to a minute budget and an action cap. That is a bounded knapsack, solved exactly with dynamic programming (greedy provably picks worse plans — one big high-scoring item can crowd out two smaller ones that together matter more). Transparent factor scoring + exact selection + human-readable reasons beats an opaque model at this scale.

**Why no streaks, badges, or failure states?** The target moment is a student on their worst week. Unfinished plan actions silently return to the pool. Past-due work says "was due Jun 28," never "OVERDUE ×13." Regenerating a plan never erases completed progress.

## Algorithm

1. **Eligibility** — only the earliest incomplete step of each task is a candidate (templates encode real sequences); communication steps are exempt and can always surface; oversized work is chunked ("Spend 35 min on…") or, on low-capacity days, transformed into a starter step; at most 2 candidates per task.
2. **Scoring** — urgency (due date) ×1.5 + importance ×1.2 + communication boost + capacity fit + quick-win bonus. Every factor is kept for the UI's "why this?" line.
3. **Selection** — exact bounded-knapsack DP over (candidates ≤ 80, minutes ≤ 240, actions ≤ 6): `dp[i][c][m] = max(dp[i-1][c][m], dp[i-1][c-1][m-w] + v)`, with backward reconstruction of the chosen set.
4. **Ordering** — communication first, then urgency. A fallback guarantees the plan is never empty while tasks exist.
5. **Adaptation** — recent reflections multiply the minute budget (×0.85 per "lighter", ×1.12 per "heavier", decay toward 1.0 on "same"; clamped 0.5–1.5; displayed as "adjusted −15% from your reflections").

Budgets by capacity: low 30 min / 3 actions · medium 90 / 5 · high 150 / 6 · unsure 45 / 3.

## Accessibility

Verifiable targets, not vibes:

- Fully usable with keyboard only — visible focus rings, skip link, focus moves to the page on navigation.
- WCAG 2.2 AA contrast; **high-contrast mode** (runtime token swap) and **larger-text mode** built in.
- `prefers-reduced-motion` respected automatically, plus a manual toggle.
- Native inputs everywhere (radios, checkboxes, `<details>`), labeled controls, `aria-live` announcements for plan updates and confirmations.
- No flashing content, no drag-and-drop requirements, ≥44 px touch targets.

## Tech Stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 (design tokens as CSS variables) · Dexie (IndexedDB) · vite-plugin-pwa (offline-capable, installable) · Vitest (62 tests).

## Getting Started

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (scheduler, parser, templates, adaptation, messages, dates, import)
npm run build      # typecheck + production build (dist/)
npm run icons      # regenerate PWA icons (zero-dependency PNG generator)
```

Deploy the `dist/` folder anywhere static. SPA fallbacks for Vercel (`vercel.json`) and Netlify (`netlify.toml`) are included.

## Disclaimer

Pace is not a medical tool and does not provide medical advice. It is a planning app for students returning from disruptions. You never need to enter a diagnosis or any medical details. Data is stored locally by default and can be deleted at any time.

## License

MIT
