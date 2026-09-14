# Global Payment Service

A payment gateway: Spring Boot backend managing accounts and transfers, React frontend to use
it. Built as an Nx monorepo (`apps/client` + `apps/server`) so both stacks share one task
runner — see [SETUP.md](SETUP.md) to build and run it from scratch.

**Status**: both apps are built end to end. Backend: accounts and transfers, idempotency
(insert-first-then-branch, guarded `FAILED → PROCESSING` retry), optimistic-lock retry on
concurrent balance updates, cross-currency transfers via a Resilience4j-wrapped mocked FX client,
and the outbox publisher notifying Fraud Detection/Notification Center (currently a structured
log line, a documented stand-in for a real webhook), all against the Flyway-managed schema.
Frontend: the three required screens (Accounts, Transfer, Transactions) as one page over that
API — see [Screen structure, UX, and visual design](#screen-structure-ux-and-visual-design) for
what was built and why. See [TODO](#todo) for what's left and in what order.

## Expectation from the UX/UI team
  Create a detailed diagram about the transaction flow what we can discuss and refine together before putting it into the sprint. A Figma design with different screen sizes to catch design issues early and iterate on it.

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

As built:

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

**Idempotency key generation (frontend)** — generated client-side (`crypto.randomUUID()`) once
when the user submits the transfer form (`TransferFlowProvider`), held in that component's state,
and reused across every automatic or manual retry of that same attempt; a fresh key is only
minted when the user starts a genuinely new transfer (reopening the modal, or editing the form
after a failure). This is the client half of the backend's idempotency contract — without it, a
network retry from the browser would never actually exercise the `X-Idempotency-Key` handling
described above. Full reasoning: `DECISION-LOG.md` #6.

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
three required capabilities (Accounts, Transfer, Transactions).

- **One page, not three routes.** All three capabilities live on a single `PageShell`: a header
  with an account switcher, that account's balance and transaction list below it, and every
  create action (new account, new transfer) opening as a modal over the same page rather than a
  navigation. There's nothing here that benefits from being a separate route — a router would add
  a moving part (history state, deep links to keep in sync with query state) for no real gain at
  this scope, and a single page keeps the account context (which account is "selected") in one
  place instead of threading it through URL params.
- **Mockups first, in a disposable design tool, before any component code.** The screens were
  drafted as a static HTML mockup board (`apps/client/design-handoff/`, one bundle per breakpoint
  and per state — loading, empty, success, 409, 503) and only then translated into the app's real
  stack (shadcn/ui on Base UI, Tailwind v4, Lucide, Geist). That handoff doc is why the two
  failure screens (insufficient balance vs. FX unavailable) read differently: a `409` is treated
  as a rejection ("Nothing was moved," edit and retry), a `503` as an outage ("Safe to retry —
  same key, same transfer row") — matching the different backend semantics from
  [Key technical decisions](#key-technical-decisions) instead of one generic error state for both.
- **The transfer flow is one modal with four swapped bodies** (filling in → pending → success →
  failed), not a page-per-step wizard, so the header amount and from/to context stay visually
  constant and the whole attempt reads as one continuous act. The pending state shows a three-step
  checklist ("Transfer accepted" → "Resolving rate" → "Moving funds") rather than a bare spinner,
  because the FX resolve step can visibly take a couple of seconds (Resilience4j retries) and a
  silent spinner over that gap reads as broken rather than working.
- **Account switching is optimistic.** Selecting a different account in the switcher applies the
  selected state immediately and shows a skeleton balance while `['accounts']`/`['transfers']`
  refetch, instead of waiting on the network before the UI reacts — the same reasoning as the
  pending-transfer checklist: perceived responsiveness matters more here than strict
  request/response ordering, and there's nothing destructive in "guessed wrong for 200ms."
- **Responsive, not adaptive**: one breakpoint at 768px switches the transaction list into a table
  and moves the switcher/"new transfer" action into the header row; there's no separate mobile
  build, just one component tree with a `useMediaQuery` branch (`PageShell.tsx`) so phone and
  desktop stay a single source of truth for behavior.
- **All UI copy is in Hungarian.** The assignment (`TASK.md`) and its intended reviewers are
  Hungarian; localizing the interface — not just the docs — was judged worth doing for a
  3-screen app small enough that it didn't need an i18n library to do it (strings are written
  directly in the components; see [TODO](#todo) if this app ever needed a second locale).
- **Deliberately skipped at this scope**: client-side routing, a design-token/theming package
  (Tailwind `@theme` variables in one stylesheet cover a single-theme app), and the "variation"
  screens the design doc sketched but didn't commit to (grouped-by-day list, expandable rows,
  multi-step transfer review, keypad entry) — the baseline flow was worth building well over
  building several UI concepts shallowly.

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

Approach across the stack:

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
- **Frontend** (React Testing Library, Jest): component/hook-level tests over the pieces with real
  logic rather than the whole tree — `useSelectedAccount` (persistence/fallback logic), the
  account switcher and new-account modal, the transaction list/row (amount sign, currency
  formatting, status badge), and `TransferFlow`'s own state machine (filling in → pending →
  success/failed, including that a retry reuses the same idempotency key rather than minting a
  new one). No e2e runner yet (Cypress — see [TODO](#todo)), so the create-account → transfer →
  see-transaction path is currently verified manually, not by an automated end-to-end test.

29 backend tests across 8 classes as of the last backend commit; `npx nx run server:test` runs
all of them. `npx nx test client` runs the frontend suite.

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
7. ~~The three frontend screens (Accounts, Transfer, Transactions)~~ — done: one page
   (`PageShell`) over the backend above, see
   [Screen structure, UX, and visual design](#screen-structure-ux-and-visual-design).
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

**Frontend** — no build/deploy pipeline (currently `nx dev`/`nx build` run by hand), no CDN for
the static assets, and no client-side error monitoring. Also no i18n library — copy is Hungarian
strings hardcoded directly in components (see
[Screen structure, UX, and visual design](#screen-structure-ux-and-visual-design)); a real
multi-locale product would need to pull that into a proper i18n layer instead of a find-and-replace.

## Running the app

Full step-by-step setup (prerequisites, clone-to-running walkthrough, smoke test, troubleshooting)
lives in **[SETUP.md](SETUP.md)** — kept separate from this file since it's a checklist to follow,
not something to read alongside the architecture/decisions above.

Quick reference, if the environment is already set up:

```sh
npm install
docker compose up -d postgres     # local Postgres, needed for bootRun (not for `test`)

npx nx run server:bootRun         # Spring Boot on :8080 — Swagger UI at :8080/swagger-ui/index.html
npx nx dev client                 # Vite dev server on :4200

npx nx run-many -t build          # build both apps
npx nx run-many -t test           # test both apps
```
