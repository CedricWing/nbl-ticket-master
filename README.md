# NBL Ticket Master

A small ticketing platform for NBL (Australia) basketball games. Browse games, book a seat, and
manage games/capacity as an admin. Built as a take-home exercise, mostly focused on
**correctly handling concurrent seat bookings** rather than piling on features.

## Quick start

Requires Docker, Node 22+, and pnpm 10+.

**To start:**

```bash
pnpm install
./.local.sh
```

This spins up Postgres in Docker, runs migrations, seeds demo data, and starts both dev servers:

- Web: http://localhost:3001
- API: http://localhost:3000
- API docs (Swagger UI): http://localhost:3000/docs

**To stop:**

```bash
./.local.sh --down    # stop dev servers and containers
./.local.sh --reset   # also wipes the Postgres volume
```

**To test:**

```bash
pnpm test              # unit tests (ticketing-api)
pnpm test:integration  # integration tests, needs Postgres running (docker compose up -d postgres)
```

Integration tests hit a real Postgres instance, not a mock, since the whole point is verifying
real transaction and constraint behavior.

**What is seeded:**

Seeding is idempotent, so it's safe to rerun (`pnpm seed`).

- **Roles** (password `password123` for all three):

  | Role                 | Email                | Notes                                                               |
  | -------------------- | -------------------- | ------------------------------------------------------------------- |
  | Admin                | `admin@example.com`  | Can create/edit games, adjust capacity, refund tickets              |
  | Member               | `member@example.com` | Regular ticket buyer                                                |
  | Season ticket holder | `season@example.com` | Has a standing claim on a seat for every Melbourne United home game |

- **Teams:** all 10 real NBL teams, each with its real home venue.
- **Seat template:** every team gets the same layout, a premium section (A) and a bigger
  general-admission section (B).
- **Games:** a handful of upcoming games pulled from the real 2026-27 season-opener fixtures, so
  the games list isn't just empty.

Each app has an `.env.example` if you want to copy it to `.env` and run outside the defaults baked
into `docker-compose.yml`.

## Architecture and tools

**Monorepo** (pnpm workspaces: [`apps/ticketing-api`](apps/ticketing-api),
[`apps/ticketing-web`](apps/ticketing-web)):

- One repo means one PR can touch an API change and its matching web change together, instead of
  coordinating a version bump across two repos. One `docker-compose.yml` and one dev script boots
  the whole stack.
- Didn't go with microservices or serverless because there's no reason to here: one team, one
  database, nothing with a scaling or failure profile different enough from the rest to justify
  what that split costs (separate deploys, network calls instead of function calls, cold starts).

**Backend** (`apps/ticketing-api`):

- **Fastify.** Schema-based validation and serialization built in, lower overhead than Express,
  and TypeScript feels native rather than bolted on.
- **Drizzle ORM + Postgres.** Stays close to plain SQL, which matters for the concurrency-critical
  queries (the CAS update especially, where the exact statement shape is the whole point), while
  still giving typed queries and migrations.
- **Zod + `fastify-type-provider-zod`.** One schema per route drives both runtime validation and
  the inferred TypeScript types, so they can't quietly drift apart.
- **`@fastify/swagger` + `@fastify/swagger-ui`.** Generates the OpenAPI docs straight from those
  same Zod route schemas, so there's no separate spec to keep in sync. Served at `/docs`.
- **`@fastify/jwt`.** Stateless auth. No session store needed for an app this size.
- **`bcryptjs`.** Pure JS bcrypt, so there's no native build step to worry about.
- **Vitest.** Fast, ESM-native, barely any config, and the same tool covers unit and integration
  tests.

**Frontend** (`apps/ticketing-web`):

- **Next.js (App Router).** Server components fetch the initial games list without a client-side
  loading flash, and file-based routing keeps the route structure obvious at a glance.
- **Tailwind + shadcn/ui.** shadcn's components live in the repo rather than behind an opaque
  package, so they're easy to tweak. Tailwind avoids a pile of one-off CSS files.
- **SWR.** A small client-side cache with built-in revalidation, used wherever a view needs to
  refetch after a mutation (the capacity form, the account page).
- **`react-hook-form` + Zod.** Uncontrolled form state (fewer re-renders), validated with the same
  schema style used on the backend.

## Folder structure

```
apps/ticketing-api/src/
  modules/
    tickets/
      schema.ts      Drizzle tables (tickets)
      repository.ts  queries (findSeatById, bookSeatIfAvailable, ...)
      service.ts     business logic and transactions (bookTicket, refundTicket)
      router.ts      HTTP layer, Zod schemas
    auth/    ...      same shape, login and JWT issuing
    games/   ...      same shape, teams/games/seats/capacity
    me/      ...      a single read with no real logic, skips straight from router to repository
  shared/
    database/  drizzle client, migrations, seed script
    errors/    AppError subclasses (NotFoundError, ConflictError, ...)
    middleware/ the global Fastify error handler
  app.ts        wires up plugins and routes
  index.ts      starts the server
```

Every module follows that same `schema.ts` → `repository.ts` → `service.ts` → `router.ts` shape,
keeping DB queries, business/transaction logic, and HTTP concerns easy to find on their own.

```
apps/ticketing-web/
  app/        routes (App Router). One folder per page, colocated with that page's
              client components (e.g. app/admin/capacity-form.tsx)
  components/ shared components used across routes, plus components/ui/ for shadcn's
              own primitives (button, card, dialog, ...)
  lib/        API client, auth context, formatting helpers, small shared utilities
```

## How double-booking is handled

This was the core problem to solve. Two users hitting "book" on the same seat at the same instant
should never both succeed. There are three layers here, each covering a different part of it.

### 1. Compare-and-swap on the seat row

Booking a seat runs a single conditional update:

```sql
UPDATE seats SET status = 'booked' WHERE id = :seatId AND status = 'available' RETURNING *;
```

- Postgres only ever lets one concurrent transaction's `UPDATE` win a given row. The loser's
  `WHERE` clause matches zero rows once the winner commits, so `RETURNING` comes back empty and
  the app reads that as "someone beat you to it" (`ConflictError`, retryable against a fresh seat
  map). No explicit row locking or `SELECT ... FOR UPDATE` needed.
- The CAS and the ticket insert run inside the same `db.transaction(...)` in `bookTicket`, so a
  failed insert rolls the seat update back too. This is also why the default isolation level
  (READ COMMITTED) is fine here: correctness comes from the single `UPDATE` being atomic at the
  row level, not from isolation.
- Verified directly: `tickets.integration.test.ts` fires two `bookTicket` calls at the same seat
  with `Promise.allSettled` and asserts exactly one resolves, one rejects with `ConflictError`.

### 2. A partial unique index as a safety net

In case the CAS above is ever bypassed, or two ticket inserts somehow race past it:

- `tickets_active_seat_unique` is a unique index on `seatId`, scoped to `WHERE status =
'confirmed'`. A second confirmed ticket for the same seat simply cannot exist at the database
  level.
- Refunded tickets are excluded from the index, so a seat can be rebooked after a refund.
- `bookTicket` catches the resulting Postgres unique-violation and turns it into the same
  `ConflictError` as the CAS path
  ([tickets/service.ts](apps/ticketing-api/src/modules/tickets/service.ts)).

### 3. Idempotency keys for safe retries

A client can pass an `Idempotency-Key` header on `POST /tickets`. This is a different problem from
the race above: it's about a client retrying its own booking request (say, after a dropped
connection) without double-booking itself.

- A retry only counts as a retry if it's for the same `seatId`, not just the same key. Reusing a
  key against a different seat gets rejected with a `ConflictError`, instead of silently resolving
  to whichever request the key happened to hit first.
- Backed by `tickets_user_idempotency_key_unique` (unique on `(userId, idempotencyKey)`, scoped to
  confirmed tickets) plus an explicit application check, so the outcome doesn't depend on which of
  two concurrent retries wins the race.

## Edge cases we handled

Same idea as above, applied elsewhere: make the write itself conditional instead of trusting an
earlier read.

- **Booking during a concurrent cancellation.** A plain `SELECT` let a booking slip through right
  as its game got cancelled, leaving a stray unrefunded ticket. Fixed with a `SELECT ... FOR SHARE`
  lock on the game row in `bookTicket` (`findGameByIdForBooking`).
- **Two admin edits racing each other.** `updateGame` read-then-wrote the game's status, so a
  cancel and a reschedule could both act on the same stale read. Fixed by moving the guard into
  the `UPDATE`'s `WHERE` clause (`updateGameIfUpcoming`), same CAS pattern as everywhere else.
- **Capacity increases colliding on seat numbers.** Caught by `seats_game_seat_unique`.
- **Capacity removal racing a booking.** Caught by the seats/tickets foreign key, a seat that
  gains a ticket mid-removal fails cleanly instead of leaving a dangling reference.
- **Refunding the same ticket twice.** Same CAS shape as booking: `refundTicketIfConfirmed`'s
  conditional `UPDATE` only lets one attempt win.
- **Booking a game that's already started.** `bookTicket` checks `startsAt` against the current
  time directly.

## Assumptions

**Product:**

- Booking counts as the whole transaction. There's no payment gateway, confirming a ticket is
  treated as done.
- One seat per booking request. A group buys by booking seats one at a time, not as a batch.
- A season ticket holder holds exactly one seat per team, not a block of seats, and that claim
  auto-applies to every home game for that team.
- `status` only moves `upcoming → completed | cancelled` through an explicit admin action.
  Nothing flips a game to `completed` on its own once `startsAt` passes, a stale `upcoming` game
  just sits there until an admin acts on it. Booking itself is still safe (see Edge cases above),
  this is only about the status label going stale, not about tickets.

**Technical:**

- Removing capacity always removes the highest seat numbers in a row (`slice(-removeCount)`), not
  an admin-chosen arbitrary seat. Simpler, and avoids reconciling removal with already-booked
  seats.
- No rate limiting on the booking endpoint. The concurrency handling guarantees correctness under
  load, but that's a different concern from abuse or bot protection.

## AI usage

[Claude Code](https://claude.com/claude-code) was used as a development assistant throughout the project to accelerate setup and act as a reviewer. Specifically, it was used for:

- **Boilerplate & Setup:** Wiring up Fastify plugins, Drizzle schemas, and initial UI components (shadcn).
- **Testing:** Implementing integration tests based on predefined test scenarios.
- **Code Review & QA:** Line-by-line passes to check for domain-logic gaps and validate edge cases.
- **Documentation:** Assisting in drafting this README from the codebase.
