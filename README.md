# Indie Relay

A community-run favour economy for indie game developers, content creators, streamers, and press. Members promote each other's games using virtual credits — no money changes hands.

Built and operated by [Quiet Terminal Interactive LTD](https://quietterminal.co.uk).

---

## How it works

- Members apply for membership and are reviewed by the committee
- Completing a promotion earns credits; requesting one spends them
- Credits are purely virtual and have no cash value
- Accounts inactive for 2 months are flagged; data is deleted 42 days after that

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Fastify 5 |
| Database | SQLite via better-sqlite3 |
| ORM / migrations | Drizzle ORM |
| Auth | JWT (jose) + bcrypt |
| Frontend | Vanilla JS, no framework |
| Language | TypeScript |

---

## Getting started

**Prerequisites:** Node.js 20+

```bash
npm install
cp .env.example .env   # fill in JWT_SECRET, SMTP settings, etc.
npm run db:migrate
npm run dev            # starts on http://localhost:3000
```

**Build for production:**

```bash
npm run build
npm start
```

**Promote a member to committee:**

```bash
npm run make-committee -- <email>
```

---

## Environment variables

See [.env.example](.env.example) for the full list. Required keys:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Secret used to sign session tokens |
| `PORT` | HTTP port (default: 3000) |
| SMTP vars | Email delivery for inactivity reminders |

---

## License

[PolyForm Attribution 1.0.0](LICENSE) — you may use, modify, and distribute this software for any purpose, but you must display the copyright attribution to users of any deployment. Copyright Quiet Terminal Interactive LTD.
