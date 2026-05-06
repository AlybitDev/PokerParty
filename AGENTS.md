# onlinepoker

Multiplayer Texas Hold'em — Next.js 16 App Router + Socket.IO custom server + Prisma SQLite.

## Run

```bash
npm run dev      # npx tsx server.ts (custom HTTP + Socket.IO server, NOT next dev)
npm run build    # next build
npm run start    # NODE_ENV=production node dist/server.js
npm run lint     # eslint
```

## Architecture

- **`server.ts`** — single entrypoint: creates an HTTP server, mounts Next.js request handler + Socket.IO on the same port. Dev runs via `tsx`, no standalone Next.js server.
- **`src/lib/poker-engine.ts`** — pure game logic (deck, hand eval, betting rounds, showdown). Stateless functions; no external deps.
- **`src/app/party/[uuid]/page.tsx`** — main SPA game page. Socket.IO client connects to the same origin. Auto-generates random adjective+animal player name.
- **`src/app/api/party/route.ts`** — REST endpoints: `POST` to create a party, `GET ?uuid=` to fetch.
- In-memory game state (`Map<partyId, GameState>` in `server.ts`). DB only written at showdown or on disconnect.

## Prisma (SQLite via Turso/LibSQL)

```bash
npx prisma generate    # regenerates client to src/generated/prisma/ (gitignored)
npx prisma migrate dev # create + apply migration
npx prisma db push     # push schema without migration
```

- Schema: `prisma/schema.prisma` — models `Party` and `Player`.
- DB file: `prisma/dev.db` (also has a copy at root `dev.db` — both are copies).
- Generated client: `src/generated/prisma/` (in `.gitignore`, must regenerate after schema changes).
- Client init: `src/lib/prisma.ts` uses `@prisma/adapter-libsql` with a local file URL.

## Important conventions

- **No tests exist.**
- **Path alias:** `@/*` → `./src/*`
- **`CLAUDE.md`** just references `AGENTS.md`.
- Only Socket.IO events drive real-time state; REST API is only for party CRUD.
- 20-second turn timer auto-folds on timeout (client-side in `page.tsx`).
