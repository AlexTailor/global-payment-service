# Global Payment Service

A payment gateway: Spring Boot backend managing accounts and transfers, React frontend to use
it. Built as an Nx monorepo (`apps/client` + `apps/server`) so both stacks share one task
runner — see [Running the app](#running-the-app) for the current commands.

**Status**: initial project scaffold only (Nx-generated React app + Spring Boot app, wired
together, nothing more). No accounts/transfers domain logic, idempotency, outbox, or FX
resilience code exists yet — those are the target design described below and are tracked as
the first items in [TODO](#todo).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend language/framework | Java 21, Spring Boot 4.x | Mandated by the assignment |
| Backend build | Gradle, wired into the Nx project graph via `@nx/gradle` | One task runner for both apps — every Gradle task shows up as an Nx target automatically, no hand-written config |
| Database | Postgres (Docker Compose), migrations TBD | Real locking semantics for the concurrency requirements — H2 would mask them |
| Backend resilience | Resilience4j (retry, circuit breaker, time limiter) — planned | Standard Spring-ecosystem fit for the flaky FX dependency |
| Frontend | React + TypeScript, Vite | Mandated language/framework; Vite over Next.js since there's no SSR/routing-server need for a 3-screen SPA, and Nx already provides the monorepo tooling a meta-framework would otherwise bring |
| Frontend data layer | TanStack Query | Server-state caching, retry, and mutation state (loading/error) for free on the transfer flow |
| Frontend UI | shadcn/ui on Base UI + Tailwind CSS v4 | Fast to build a clean 3-screen app without hand-rolling components; shadcn components are copied into `src/components/ui` as source, so they're fully ours to restyle |
| Testing (backend) | JUnit 5, Mockito; H2 in-memory for `nx run server:test`, real Postgres via Docker Compose for manual runs | Testcontainers was deliberately **not** added — keeps `nx run server:test` independent of Docker; re-add `spring-boot-testcontainers` deliberately if real-Postgres integration tests are wanted later |
| Testing (frontend) | React Testing Library (Jest, the `@nx/react` default) | Covers component/form logic for now; no e2e runner configured yet (Cypress is a candidate — see TODO) |
| Local orchestration | Docker Compose | Currently brings up Postgres only; backend runs directly via Gradle/Nx, not containerized yet |

## Project structure

- `apps/client` — React 19 + TypeScript SPA (Vite), built and tested through Nx.
- `apps/server` — Spring Boot 4 backend (Java 21, Gradle), integrated into the Nx project graph
  via the `@nx/gradle` plugin. Every Gradle task (`build`, `test`, `bootRun`, `bootJar`,
  `clean`, ...) is automatically available as an Nx target — no hand-written `project.json`.
- `libs/` — reserved for shared libraries (empty for now).

## High-level architecture

Target design once the domain layer is built:

```
React SPA -> Spring Boot API layer -> Domain layer (transfer orchestration, idempotency) -> Postgres
                                              |
                                              +-- External FX rate API (mocked, flaky -- wrapped with retry/circuit breaker)
                                              +-- Outbox (transfer.notified_at) -> scheduled publisher -> Fraud Detection / Notification Center
```

Three backend layers (controller -> service -> repository), two Postgres tables (`account`,
`transfer` — idempotency and outbox state both live as columns on `transfer` rather than
separate tables, see `DECISION-LOG.md` #7) for reliably telling the rest of the (imagined)
larger system about completed transfers. Full package layout and data model: see
`server/README.md`.

## Key technical decisions

**Idempotency** — `X-Idempotency-Key` enforced via an insert-first-then-branch pattern against a
unique DB constraint on the key, with no separate idempotency table: the `transfer` row itself
carries `idempotency_key` + `status`, so the request that loses the insert race reads back the
winner's state directly off that row and responds accordingly (`PROCESSING` → `409`, `COMPLETED`
→ replay the original `201`, `FAILED` → the row is reused in place via a guarded update, not
deleted and reinserted). Detecting a reused key with a mismatched payload (`422`) isn't
implemented — that needs a stored request hash the data model deliberately leaves out; logged as
a TODO instead. To be covered by a concurrency test that fires the same key twice in parallel and
asserts exactly one transfer was created. *(Not yet implemented — see TODO.)*

**Account balance concurrency** — optimistic locking (`@Version` on `Account`) with a bounded
retry on conflict, chosen over pessimistic `SELECT ... FOR UPDATE` for simplicity of reasoning at
this scope; the pessimistic-locking-with-consistent-lock-order alternative was considered and
rejected. *(Not yet implemented.)*

**Currency conversion / FX resilience** — the FX client will be wrapped with Resilience4j retry +
circuit breaker + time limiter rather than called directly; a failed lookup after retries returns
`503` and flips the already-created `Transfer` row to `FAILED` in place (it persists and stays
queryable via `GET /api/transfers`), so a retry with the same key reuses that row instead of
replaying a stored failure. This only holds because FX resolution always happens before any
debit/credit — see `DECISION-LOG.md` #4 for the full failure-response reasoning (per-failure-type
status codes, the no-partial-application invariant). *(Not yet implemented — Resilience4j isn't in
`build.gradle` yet.)*

**Propagating completed transfers (Fraud Detection / Notification Center)** — transactional
outbox, implemented as a nullable `notified_at` column on `transfer` rather than a separate
outbox table (see `DECISION-LOG.md` #7): it's left `null` in the same transaction that completes
the transfer, and a scheduled poller publishes each unnotified row (webhook call for this build)
and sets `notified_at`. Chosen over a direct in-transaction webhook call (which would risk a
dual-write / lost-event problem) and over standing up a real broker (out of scope for the time
budget — logged as a TODO). *(Not yet implemented.)*

**CQRS** — considered, not adopted. Full CQRS (separate read/write models, typically paired with
event sourcing) would buy independent read-side scaling and a built-in audit trail, but both are
irrelevant at this data volume, and splitting into eventually-consistent stores would add a
synchronization problem the assignment isn't asking for and that could make the transactions
screen show stale data right after a transfer. Plan is a lightweight command/query service split
instead — one transactional write path, separate read-only query services — same database, no
eventual consistency.

**Idempotency key generation (frontend)** — generated client-side (`crypto.randomUUID()`) per
transfer attempt and reused across retries of the same attempt, so a network retry from the
browser lines up with the backend's idempotency contract instead of minting a new key each time.
*(Not yet implemented — no transfer screen exists yet.)*

**Frontend stack, beyond the React + TypeScript requirement:**

- **Server state: TanStack Query.** Most of this app's state is server data (payments, balances,
  transaction history) rather than client-only UI state, so a caching/invalidation-aware query
  library covers the bulk of state management needs without pulling in a general-purpose store
  like Redux. Local UI state uses plain React state/context.
- **HTTP client: axios.** Interceptors make it straightforward to attach auth tokens and
  centralize error handling across a payments API surface.
- **Forms/validation: react-hook-form + zod** (via `@hookform/resolvers`). Uncontrolled-by-default
  forms keep re-renders low, and zod schemas double as a single source of truth for both
  validation and inferred TypeScript types.

Fuller reasoning and rejected alternatives for each of these: see `DECISION-LOG.md`.

## How I started

Started by scaffolding the Nx workspace itself — an `@nx/react` app for the client and a
Spring Boot app wired into the Nx project graph via `@nx/gradle` for the server — so both build
systems land on one task runner (`nx run-many`, `nx affected`) before any domain code exists.
Next up is the backend domain layer (`Account` / `Transfer` entities, the idempotency-key
constraint, then the transfer endpoint), since the frontend has nothing to call until that
exists.

## Edge cases

*(resilience, concurrency, reliability — expand as each is implemented; the intended handling
for idempotency races, optimistic-lock conflicts, and FX failures is described under
[Key technical decisions](#key-technical-decisions) above)*

One resolved up front since it affects the API contract directly: a transfer that fails for any
reason (FX exhausted, insufficient balance, unknown account, validation) leaves a `Transfer` row
behind in `FAILED` status — created as `PROCESSING` before the failure, flipped in place rather
than deleted — so it stays queryable via `GET /api/transfers`. A retry with the same key reuses
that exact row via a guarded update (`FAILED → PROCESSING`, only when no concurrent retry has
already claimed it) rather than replaying a stored response. That's only safe because FX
resolution and validation always run before any balance mutation, and the debit/credit/`COMPLETED`
update happen in one transaction — a row stuck at `FAILED` always means zero balance movement.
Full reasoning: `DECISION-LOG.md` #4 and #7, algorithm: `server/README.md` §4.

## TODO

Roughly in the order I'd tackle them:

1. Account and transfer domain model + `POST /api/transfers` + transactions query endpoint —
   nothing works end-to-end without this.
2. `X-Idempotency-Key` handling (insert-first-then-branch + concurrency test) — a stated hard
   requirement, and easiest to get right before other logic builds on top of it.
3. Optimistic-locking retry on `Account` balance updates.
4. Mocked FX API + Resilience4j wrapping (retry/circuit breaker/time limiter).
5. Outbox table + scheduled publisher for Fraud Detection / Notification Center.
6. The three frontend screens (Accounts, Transfer, Transactions) against the above.
7. Flyway migrations, replacing `spring.jpa.hibernate.ddl-auto=update` (fine for scaffolding,
   not for anything real).
8. Real message broker (Kafka/RabbitMQ) instead of the outbox + webhook stand-in.
9. Cypress e2e for the create-account → transfer → see-transaction path.
10. Auth/authz on the API (not a stated requirement — explicitly out of scope here).
11. Pagination on the transactions list.
12. Rate limiting on the API.

## Going to production

*(what's needed for real customers / what a full sprint would add)*

## Running the app

### Prerequisites

- Node.js 22+ and npm
- Java 21+ (JDK), with `JAVA_HOME` set and `$JAVA_HOME/bin` on `PATH`. On macOS:
  `brew install openjdk@21` (keg-only — not symlinked into `/opt/homebrew`, so it won't be found
  unless exported).
- Docker (for the local Postgres instance used by `apps/server`).

### Commands

```sh
npm install                       # install JS deps (once, or after touching apps/client or root package.json)

docker compose up -d postgres     # start local Postgres (needed for bootRun, not for `test`)

npx nx dev client                 # React dev server (Vite)
npx nx run server:bootRun         # Spring Boot app on :8080

npx nx run-many -t build          # build both apps
npx nx run-many -t test           # test both apps
npx nx affected -t build test     # only what changed vs. main

npx nx build client               # client only
npx nx run server:build           # server only (full Gradle `build`)
npx nx run server:test            # server only (Gradle `test`)

npx nx graph                      # visualize the project graph
```

Any Gradle task name works as an Nx target on `server` (e.g. `npx nx run server:bootJar`,
`npx nx run server:clean`) without further configuration. `apps/server` is also a normal Gradle
project and can be driven directly with its wrapper when you want raw Gradle output:

```sh
cd apps/server
./gradlew bootRun
./gradlew test
```

### Backend notes

Two datasources are wired in for two different purposes:

- **PostgreSQL** is the real datasource, configured via `spring.datasource.*` in
  `application.properties` (`docker-compose.yml` at the repo root brings up a matching local
  instance on `:5432`, default db/user/password `global_payment_service` / `postgres` /
  `postgres`; override with the `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`
  env vars for other environments).
- **H2** is only for tests: `src/test/resources/application.properties` overrides the main
  config with no datasource URL, so Spring Boot's embedded-database autoconfiguration falls back
  to H2 and `nx run server:test` never needs Postgres or Docker running.

### Frontend notes

`apps/client` is a React 19 + TypeScript SPA. Add more shadcn/ui components with:

```sh
cd apps/client
npx shadcn@latest add <component>
```

`@/*` resolves to `apps/client/src/*` (configured in `tsconfig.app.json` and `vite.config.mts`).
