# Global Payment Service

A payment gateway: Spring Boot backend managing accounts and transfers, React frontend to use
it. Built as an Nx monorepo (`apps/client` + `apps/server`) so both stacks share one task
runner — see [Running the app](#running-the-app) for the current commands.

**Status**: the backend's core is done — accounts and transfers end to end, idempotency
(insert-first-then-branch, guarded `FAILED → PROCESSING` retry), optimistic-lock retry on
concurrent balance updates, cross-currency transfers via a Resilience4j-wrapped mocked FX client,
and the outbox publisher notifying Fraud Detection/Notification Center (currently a structured
log line, a documented stand-in for a real webhook), all against the Flyway-managed schema. The
frontend doesn't exist yet — see [TODO](#todo) for what's next and why in that order.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend language/framework | Java 21, Spring Boot 4.x | Mandated by the assignment |
| Backend build | Gradle, wired into the Nx project graph via `@nx/gradle` | One task runner for both apps — every Gradle task shows up as an Nx target automatically, no hand-written config |
| Database | Postgres (Docker Compose), Flyway migrations | Real locking semantics for the concurrency requirements — H2 would mask them |
| Backend resilience | Resilience4j (retry, circuit breaker, time limiter) | Standard Spring-ecosystem fit for the flaky FX dependency |
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
a TODO instead. Covered by concurrency tests that fire the same key twice in parallel and assert
exactly one transfer was created (`TransferIdempotencyTest`).

**Account balance concurrency** — optimistic locking (`@Version` on `Account`) with a bounded
retry (3 attempts) on conflict, chosen over pessimistic `SELECT ... FOR UPDATE` for simplicity of
reasoning at this scope; the pessimistic-locking-with-consistent-lock-order alternative was
considered and rejected. Real-thread concurrency tests don't reliably force two transactions to
interleave (they usually just serialize cleanly), so the retry loop itself is verified
deterministically with a mocked persistence layer (`TransferServiceRetryTest`) rather than hoped
for from a race.

**Currency conversion / FX resilience** — the FX client is wrapped with Resilience4j retry +
circuit breaker + time limiter rather than called directly; a failed lookup after retries returns
`503` and flips the already-created `Transfer` row to `FAILED` in place (it persists and stays
queryable via `GET /api/transfers`), so a retry with the same key reuses that row instead of
replaying a stored failure. This only holds because FX resolution always happens before any
debit/credit — see `DECISION-LOG.md` #4 for the full failure-response reasoning (per-failure-type
status codes, the no-partial-application invariant). The client interface is async
(`CompletableFuture<BigDecimal>`) specifically so `@TimeLimiter` can enforce a real timeout —
it only applies to async-returning methods; `TransferService` blocks on `.get()`. Verified live
against real Postgres: a EUR→HUF transfer resolves the mocked rate and credits the converted
amount correctly.

**Propagating completed transfers (Fraud Detection / Notification Center)** — transactional
outbox, implemented as a nullable `notified_at` column on `transfer` rather than a separate
outbox table (see `DECISION-LOG.md` #7): it's left `null` in the same transaction that completes
the transfer, and a scheduled poller (`TransferEventPublisher`) publishes each unnotified row and
sets `notified_at`. The actual publish goes through a `TransferNotifier` port — for this build the
only adapter logs the event (a legitimate stand-in at this scope, per server README §7); swapping
in a real webhook POST is the extension point once a real Fraud Detection/Notification Center
endpoint exists. Chosen over a direct in-transaction webhook call (which would risk a dual-write /
lost-event problem) and over standing up a real broker (out of scope for the time budget — logged
as a TODO).

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

**Screen structure, UX, and visual design** — TASK.md asks what was prioritized here beyond the
three required capabilities (Accounts, Transfer, Transactions). Not yet written: there's no
frontend code yet to honestly rationalize decisions about (navigation structure, loading/error
feedback on the transfer flow, optimistic UI on retry, etc.) — this section gets filled in
alongside the frontend build itself, not before it, so it describes what was actually built
rather than a plan that may not survive contact with it.

## How I started

Started by scaffolding the Nx workspace itself — an `@nx/react` app for the client and a
Spring Boot app wired into the Nx project graph via `@nx/gradle` for the server — so both build
systems land on one task runner (`nx run-many`, `nx affected`) before any domain code exists.
Next up is the backend domain layer (`Account` / `Transfer` entities, the idempotency-key
constraint, then the transfer endpoint), since the frontend has nothing to call until that
exists.

## Edge cases

Resilience, concurrency, and reliability handling — all implemented, per
[Key technical decisions](#key-technical-decisions) above:

- **Idempotency races** (same key, concurrent requests): the losing request reads back the
  winner's state and responds accordingly (`PROCESSING` → `409`, `COMPLETED` → replay `201`) —
  server README §4, `TransferIdempotencyTest`.
- **A transfer that fails for any reason** (FX exhausted, insufficient balance, unknown account,
  validation) leaves a `Transfer` row behind in `FAILED` status — created as `PROCESSING` before
  the failure, flipped in place rather than deleted — so it stays queryable via
  `GET /api/transfers`. A retry with the same key reuses that exact row via a guarded update
  (`FAILED → PROCESSING`, only when no concurrent retry has already claimed it) rather than
  replaying a stored response. That's only safe because FX resolution and validation always run
  before any balance mutation, and the debit/credit/`COMPLETED` update happen in one transaction
  — a row stuck at `FAILED` always means zero balance movement. Full reasoning: `DECISION-LOG.md`
  #4 and #7, algorithm: `server/README.md` §4.
- **Different idempotency keys hitting the same account concurrently**: bounded optimistic-lock
  retry (3 attempts) on the account-version conflict, independent of the idempotency mechanism
  above — server README §5, `TransferServiceRetryTest` (deterministic; real-thread races don't
  reliably force the interleaving, see that test's docstring for why).
- **FX API flakiness** (503s, latency): Resilience4j retry + circuit breaker + time limiter
  around the FX client, failing the transfer cleanly rather than proceeding without a confirmed
  rate — server README §6.
- **Outbox delivery failure**: a failed notification attempt leaves `notified_at` null and is
  retried on the next poll; one transfer's failure doesn't block others in the same poll — server
  README §7, `TransferEventPublisherTest`.

## Testing

Approach across the stack (backend only exists so far — frontend testing is planned per the
[tech stack](#tech-stack) table's "why" column, not yet built):

- **Unit** (deterministic, no Spring context or database): `TransferServiceRetryTest` mocks
  `TransferPersistence` to force an optimistic-lock conflict and verify the retry loop itself —
  chosen specifically because real concurrent threads don't reliably interleave enough to trigger
  the conflict naturally (confirmed empirically, see `DECISION-LOG.md`'s implementation note on
  §5). `TransferEventPublisherTest` mocks the repository/notifier the same way for the outbox
  publish/retry logic.
- **Integration** (`@SpringBootTest`, H2 — no Testcontainers, see the tech-stack table's "why"):
  `AccountControllerTest`, `TransferControllerTest`, `TransferFxTest` (FX success/failure with a
  `@MockitoBean`-replaced `ExchangeRateClient`, for determinism the real randomized mock can't
  give), `TransferEventPublisherIntegrationTest` (real repository query + wiring, not the
  scheduler's timer).
- **Concurrency** (the one TASK.md is actually testing for): `TransferIdempotencyTest` fires
  genuinely concurrent requests via `ExecutorService` + latches for both races idempotency has to
  survive — same key twice, and a retry of a `FAILED` key twice — and asserts exactly one
  execution each time; log output confirms the threads actually collided, not just ran
  sequentially and happened to pass.
- Every backend change was also run live against real Postgres (`docker compose up -d postgres`
  + `curl`) before being committed, not just against the H2 test suite — this is what caught two
  real H2/Postgres divergences during development (`DECISION-LOG.md` #8, `PROMPTS.md`).

29 tests across 8 classes as of the last backend commit; `npx nx run server:test` runs all of them.

## TODO

Roughly in the order I'd tackle them:

1. ~~Flyway migration for `account`/`transfer`~~ — done (`db/migration/V1__init.sql`).
2. ~~`Account`/`Transfer` JPA entities + repositories + accounts/transfers CRUD endpoints~~ —
   done: `POST`/`GET /api/accounts`, `GET /api/accounts/{id}`, `POST`/`GET /api/transfers`,
   `GET /api/transfers/{id}`.
3. ~~`X-Idempotency-Key` handling~~ — done: insert-first-then-branch, guarded
   `FAILED → PROCESSING` reclaim, concurrency tests (`TransferIdempotencyTest`).
4. ~~Optimistic-locking retry on `Account` balance updates~~ — done: bounded retry (3 attempts)
   in `TransferService`, deterministically tested via a mocked `TransferPersistence`
   (`TransferServiceRetryTest`) since real-thread races don't reliably force the interleaving.
5. ~~Mocked FX API + Resilience4j wrapping~~ — done: async `ExchangeRateClient`
   (`CompletableFuture<BigDecimal>`, needed for `@TimeLimiter` to apply at all) wrapping an
   in-process mock with `@Retry`/`@CircuitBreaker`/`@TimeLimiter`; cross-currency transfers now
   supported. Deterministic tests mock `ExchangeRateClient` itself (`TransferFxTest`) rather than
   relying on the real mock's randomness.
6. ~~Outbox publisher~~ — done: `TransferEventPublisher` (`@Scheduled`, polls
   `notified_at is null`) + `TransferNotifier` port, `LoggingTransferNotifier` the only adapter
   for now (logs the event — see the "propagating completed transfers" decision above for why
   that's a legitimate stand-in at this scope, and item 8 below for the real-transport upgrade).
7. The three frontend screens (Accounts, Transfer, Transactions) against the above.
8. Real message broker (Kafka/RabbitMQ) instead of the outbox + webhook stand-in.
9. Cypress e2e for the create-account → transfer → see-transaction path.
10. Auth/authz on the API (not a stated requirement — explicitly out of scope here).
11. Pagination on the transactions list.
12. Rate limiting on the API.

## Going to production

What's here is deliberately scoped to the assignment, not to real customers. Roughly in the
order a real sprint would tackle it:

**Security** — the biggest gap. `SecurityConfig` currently permits every request; there's no
authentication at all. A real deployment needs at least: authenticated API access (OAuth2/JWT is
the natural fit given Spring Security is already a dependency), secrets out of
`application.properties` and into a real secrets manager (the DB password is a plaintext default
right now), TLS termination, and input hardening beyond the current bean validation (e.g. request
size limits, stricter currency/amount bounds tied to real business rules rather than "just not
negative").

**Reliability & observability** — the outbox publisher logs events instead of calling a real
endpoint (`TransferNotifier`/`LoggingTransferNotifier`, server README §7) — swapping in a real
webhook or message broker client is the concrete next step, and needs its own retry/dead-letter
handling once it's a real network call. Beyond that: structured logging with correlation IDs
across a request's idempotency-claim/FX-resolve/execute steps, metrics on the Resilience4j
circuit breaker's state (open/half-open transitions should page someone, not just sit in logs),
and the actuator health endpoint wired to real readiness/liveness checks rather than defaults.

**Scale & concurrency** — optimistic locking on `Account.balance` degrades under sustained
contention on one hot account (acknowledged in `DECISION-LOG.md` #3) — a production system with
known hot accounts (e.g. a merchant settlement account) would need to revisit that, likely with
pessimistic locking scoped to just those accounts. `GET /api/accounts` and `GET /api/transfers`
return everything unpaginated (TODO below) — fine at this data volume, not at production volume.
The outbox poller (`@Scheduled` on a single instance) would double-publish if the app ever runs
with more than one replica — needs a leader-election or per-row locking scheme (e.g. `SELECT ...
FOR UPDATE SKIP LOCKED`) before horizontal scaling.

**Testing & CI** — there's no CI pipeline at all yet (build + test + security scan on every PR
would be the first addition). The backend test suite deliberately runs against H2, not
Testcontainers-backed Postgres (root README tech-stack table) — worth adding a smaller,
Postgres-specific integration suite before production, since H2 already caught real divergences
during development (`DECISION-LOG.md` #8) that a wider Testcontainers suite would catch even
more of. Load/chaos testing the actual Resilience4j tuning (retry counts, circuit-breaker
thresholds) against realistic traffic, rather than the arbitrary values currently set, would come
before trusting them in production.

**Data lifecycle** — Flyway migrations exist but there's no rollback/backward-compatibility
discipline yet (e.g. expand/contract migrations for zero-downtime deploys), no backup/PITR
strategy, and idempotency keys never expire (a `transfer` row lives forever) — a real system
would need a retention/archival policy once volume makes that matter.

**Deployment** — the backend runs directly via Gradle/Nx locally, not containerized (root README
tech-stack table); a real deployment needs a container image, environment-based configuration
injection (not the hardcoded defaults in `application.properties`), and a real orchestration
target (Kubernetes, ECS, etc.) instead of a developer's machine plus `docker compose`.

**Frontend** — doesn't exist yet at all; once it does, production readiness there means a real
build/deploy pipeline, CDN-served static assets, and client-side error monitoring — none of which
is relevant to discuss further until the three screens themselves exist.

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
npx nx run server:bootRun         # Spring Boot app on :8080 — API docs at :8080/swagger-ui/index.html

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

The schema is Flyway-managed (`apps/server/src/main/resources/db/migration/V1__init.sql`,
`account` + `transfer` tables — see `server/README.md` §2); `spring.jpa.hibernate.ddl-auto` is
`validate` everywhere, never `update`. Two datasources run that same migration for two different
purposes:

- **PostgreSQL** is the real datasource, configured via `spring.datasource.*` in
  `application.properties` (`docker-compose.yml` at the repo root brings up a matching local
  instance mapped to host port `:5732` → the container's standard `5432`, default db/user/password
  `global_payment_service` / `postgres` / `postgres`; override with the `DB_HOST` / `DB_PORT` /
  `DB_NAME` / `DB_USER` / `DB_PASSWORD` env vars for other environments).
- **H2** is for tests: `src/test/resources/application.properties` points at
  `jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE` so Flyway runs the *same*
  `V1__init.sql` there too (not a Hibernate-autogenerated schema that could drift from it) —
  `nx run server:test` still never needs Postgres or Docker running. Needs
  `org.springframework.boot:spring-boot-flyway` on the classpath explicitly: Spring Boot 4 split
  Flyway's autoconfiguration out of `spring-boot-autoconfigure`, so `flyway-core` alone silently
  does nothing (no error, no log line).

### Frontend notes

`apps/client` is a React 19 + TypeScript SPA. Add more shadcn/ui components with:

```sh
cd apps/client
npx shadcn@latest add <component>
```

`@/*` resolves to `apps/client/src/*` (configured in `tsconfig.app.json` and `vite.config.mts`).
