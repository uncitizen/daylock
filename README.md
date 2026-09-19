# Daylock

Web-first personal task manager: **My Day** + a single **Inbox**.

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
| **My Day** | Today’s timeline: calendar, repeats, pinned inbox tasks |
| **Inbox** | Capture flex + repeating tasks (one list) |

Backend still has workspaces/API stubs for family later; UI stays two screens.