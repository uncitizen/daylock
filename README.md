# Daylock

Web-first personal task manager: **My Day** for today, **Streams** for everything else.

- Streams (Kids, Health, Work…) with an importance weight; the board shows want vs got and surfaces the one you're neglecting
- Soft vs hard recurring tasks (skip or escalate alarms)
- Google Calendar blocks stay locked; set attention to suggest fill-work while waiting

## Quick start

```bash
docker compose up -d
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Dev sign in (or configure Google OAuth).

## Surfaces

| Screen | Purpose |
|--------|---------|
| **My Day** | Today’s timeline: calendar, repeats, pinned and suggested tasks, tagged by stream |
| **Streams** | Inbox lane to sort (dots or keys 1–9), stream lanes sorted by pressure, backlog by goal, Pick 3 for today |
| **Shopping** | One reusable list split by store (Costco, Fortinos…). Tap to check off, clear the cart, re-add from "Buy again". Separate from tasks and streams |
| **Inbox** (via Streams) | Full capture: repeats, dates, calendar sync, trash |

Capture with `#stream` (e.g. `Book physio #health`) to skip the Inbox.

Stream pressure = `2 × max(0, want% − got%) + quiet days × want% / 10`, where got% is the share of finished estimated minutes over the last 7 days.

Backend still has workspaces/API stubs for family later; UI stays two screens.