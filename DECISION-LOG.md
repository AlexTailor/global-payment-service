# Decision log

Deeper reasoning behind the choices summarized in `README.md`. Written so it can be defended in
the interview — each entry is context → options considered → what was picked → why.

---

### 1. Backend layering: controller → service → repository, no CQRS

**Context**: the assignment specifically grades how problems get broken down and where layer
boundaries sit.

**Options**:
- Classic layered architecture (chosen)
- Full CQRS with separate read/write models
- Hexagonal/ports-and-adapters with full isolation of the domain from Spring

**Decision**: classic layering, with a lightweight command/query split inside it (write path
through `TransferService`, reads through separate query services returning DTOs).

**Why**: full CQRS buys independent read-scaling and an audit trail via event sourcing — neither
is relevant at this data volume, and it would introduce eventual consistency exactly where the
assignment is testing atomicity and locking on a single write model. A full ports-and-adapters
isolation (domain with zero Spring annotations, mapped at the edges) is defensible but is more
ceremony than 10-12 hours supports well; the one place that pattern earns its keep here — the FX
client — does get treated as a swappable port (`ExchangeRateClient` interface + adapter) while the
rest stays pragmatically coupled to Spring/JPA.

---

### 2. Idempotency: insert-first against a unique constraint, not check-then-insert

**Context**: `X-Idempotency-Key` must survive a genuine concurrent duplicate (two requests with
the same key arriving essentially simultaneously), not just a sequential retry.

**Options**:
- Check-then-insert (read for existing key, insert if absent)
- Insert-first, branch on unique-constraint conflict (chosen)
- Application-level lock (e.g. a `ConcurrentHashMap` of in-flight keys)

**Decision**: insert-first.

**Why**: check-then-insert has a race in exactly the window the requirement exists to close — two
threads can both pass the "does it exist" check before either inserts. Insert-first makes the
database's unique constraint the actual lock: exactly one concurrent insert succeeds, and the
loser's insert failure is the signal to read back and branch on the winner's state. An
application-level in-memory lock doesn't survive multiple instances of the service, which a real
payment service would run — the DB constraint does, for free.

**Retrying a `FAILED` attempt needs the same exactly-one-winner property**: since #7 makes the
`transfer` row itself the idempotency record, a retry of a `FAILED` key doesn't get a fresh
`insert` to rely on — it has to flip the existing row `FAILED → PROCESSING`. A bare `UPDATE ...
WHERE id = ...` doesn't provide that guarantee (two concurrent retries could both "succeed" at
it), so the update is guarded with `AND status = 'FAILED'` plus an affected-row check, which is
what actually closes the race — see server README §4.

---

### 3. Account balance concurrency: optimistic locking over pessimistic

**Context**: two different transfers can hit the same account at once, independent of
idempotency.

**Options**:
- Optimistic locking (`@Version`, retry on conflict) — chosen
- Pessimistic locking (`SELECT ... FOR UPDATE`, consistent lock ordering to avoid deadlock)

**Decision**: optimistic, with a bounded retry (2-3 attempts) on `OptimisticLockException`.

**Why**: at the throughput this exercise implies, contention on a single account is rare, so
optimistic locking's "assume no conflict, detect and retry if wrong" is cheaper than pessimistic
locking's "always pay the lock cost." It's also simpler to reason about and test — no deadlock
ordering to get right. Trade-off acknowledged: under genuinely high contention on one hot account,
optimistic locking degrades (repeated retries) where pessimistic locking would just queue —
worth naming if asked, and the kind of thing a production system with known hot accounts (e.g. a
merchant settlement account) would revisit.

---

### 4. FX resilience: retry + circuit breaker + time limiter, fail closed

**Context**: the FX API is deliberately flaky (503s, latency) — the assignment states this is a
resilience test, not a bug to route around.

**Options**:
- Retry only
- Retry + circuit breaker + timeout (chosen)
- Cache-and-serve-stale rates indefinitely on failure

**Decision**: bounded retry with backoff, circuit breaker to stop hammering a downed dependency,
timeout so a hung call doesn't hold a transfer open indefinitely. On exhaustion, fail the
transfer (`FAILED`, safe to retry via the same idempotency key) rather than proceed without a
confirmed rate.

**Why**: retry alone doesn't protect the FX API (or the caller's thread pool) once it's actually
down — the circuit breaker is what turns "flaky dependency" from a latency problem into a fast-fail
problem. Serving stale rates indefinitely was rejected because it silently changes what a transfer
means (moving money at an unconfirmed rate) — worse than a visible, retryable failure for a
payment system specifically.

**Failure response shape**: TASK.md only specifies retry semantics for a *repeated* idempotency
key (success → replay `201`, still-processing → `409`, failed → "the user may retry"); it says
nothing about the response to the *first*, failing request. Resolved as: the `transfer` row is
created `PROCESSING` before FX resolution starts (#7), and a failed lookup flips it to `FAILED`
in place rather than deleting it — the row persists, stays queryable via `GET /api/transfers`
with `status=FAILED`, and is reused (not replayed) on retry through the guarded update in #2.
The HTTP status on the failing request matches the failure (`503` FX exhaustion, `404` unknown
account, `409` insufficient balance or a lost retry race, `400` validation) rather than one
generic code, since these are distinguishable, client-actionable outcomes. This only holds
together because of one invariant: FX resolution and all validation complete *before* any balance
mutation, and the debit + credit + `COMPLETED` update are one atomic transaction — so a row stuck
at `FAILED` always means zero balance movement, which is what makes reusing it on retry safe
rather than a double-charge risk.

**Implementation note — async interface**: `ExchangeRateClient.getRate` returns
`CompletableFuture<BigDecimal>`, not a plain `BigDecimal`. Resilience4j's `@TimeLimiter` — the
mechanism actually enforcing the "latency" half of the flakiness requirement — only applies to
methods returning an async type; a synchronous method can't be time-limited by it at all.
`TransferService` blocks on `.get()`, which is standard practice for a synchronous caller wanting
a hard timeout around a declared-async operation. The alternative (drop `@TimeLimiter`, keep the
interface synchronous) was considered and rejected: the mock's simulated latency is self-bounded
so nothing can truly hang, but that's an argument for why a timeout is *safe* to skip, not why
the delay-handling requirement is actually met — TASK.md names delays specifically, and having a
real timeout guard is a stronger answer than explaining around its absence.

---

### 5. Propagating completed transfers: transactional outbox, not a direct call

**Context**: Fraud Detection and Notification Center need to know about every successful transfer.

**Options**:
- Call them directly (e.g. HTTP) inside the transfer transaction
- Publish an in-process event after commit (`ApplicationEventListener`)
- Transactional outbox + scheduled publisher (chosen)

**Decision**: an outbox record written in the same transaction as the transfer, drained by a
scheduler.

**Why**: a direct call inside the transaction couples the transfer's success to an unrelated
service's availability — a Fraud Detection outage shouldn't block payments. An in-process
post-commit event is simpler to build but loses the event if the process crashes between commit
and publish. The outbox accepts a small amount of extra code for a correctness guarantee (the
event is durable the instant the transfer is durable) that fits a payment system's actual
requirements better than either alternative. Explicitly not building a full message broker for
this — logged as a TODO — since the outbox record is the part that carries the actual guarantee;
the transport (webhook vs. Kafka) is swappable later without touching this decision.

**Implementation note**: this lives as a nullable `notified_at` column on `transfer` rather than
a separate `outbox_event` table — see #7 for why that's still the same guarantee with one fewer
table. The publish step itself goes through a `TransferNotifier` port; the only adapter
(`LoggingTransferNotifier`) logs the event rather than making a real HTTP call — there's no real
Fraud Detection/Notification Center endpoint to call in this exercise, and a structured log line
consumers could tail is the scope-appropriate stand-in named in the server README from the start.
The port exists specifically so a real webhook adapter is a drop-in swap later, without touching
the outbox mechanism (durability, retry-on-failure) this decision is actually about.

---

### 6. Frontend idempotency key lifecycle

**Context**: idempotency is only useful if the client's retries reuse the same key.

**Options**:
- New key per HTTP call (defeats the purpose)
- Key generated once per transfer attempt and reused across retries of that attempt (chosen)

**Decision**: `crypto.randomUUID()` generated when the user submits the transfer form, held in
component/mutation state, reused for any automatic or manual retry of that same submission; a
fresh key is only generated if the user starts a genuinely new transfer.

**Why**: this is the client-side half of the backend contract — without it, the backend's
idempotency guarantee never actually gets exercised by a real retry.

---

### 7. Database structure: two tables (`account`, `transfer`), not four

**Context**: an earlier draft of this plan used four tables — `account`, `transfer`,
`idempotency_record`, `outbox_event` — following the textbook shape of each pattern
(idempotency store, transactional outbox) as its own entity.

**Options**:
- Four tables, one per concern (initial draft)
- Two tables — fold idempotency and outbox state onto `transfer` (chosen)

**Decision**: `idempotency_record` and `outbox_event` collapse into columns on `transfer`:
`idempotency_key` (unique) + `status` replace the idempotency table; a nullable `notified_at`
replaces the outbox table.

**Why**: both separate tables exist, in the general case, to solve a problem this scope doesn't
actually have. `idempotency_record` earns its keep when one idempotency mechanism has to serve
*multiple kinds* of operation — here there's exactly one endpoint, so the idempotency key's
scope and the transfer's scope are the same thing, and splitting them just adds a join to
reconstruct a replayed response that the `transfer` row already contains in full. The outbox
table's entire value is "the event survives being written in the same transaction as the fact
it describes" — a nullable `notified_at` column on `transfer`, set within the same transaction
that marks the transfer `COMPLETED`, gives that identical guarantee, because it's the same
commit either way. A separate outbox table only pays for itself once a single commit can
produce *multiple event types* across *multiple aggregates*; here it's one event type,
one-to-one with `transfer` rows.

**What would flip this back**: a second endpoint reusing the idempotency mechanism (idempotency
scope would then outlive a single transfer type), or a second event type needing to fire off a
completed transfer (one row can only cleanly track one `notified_at`). Both are reasonable
production evolutions, worth naming as the TODO trigger rather than building for now.

**Trade-off this creates**: because the same row now is the idempotency record, a `FAILED`
attempt is reused in place on retry rather than deleted and reinserted — which means the retry
path needs its own concurrency guard (see #2) that a fresh `insert` would otherwise have given
for free.

**Also cut, and why**: a `request_hash` column to detect idempotency-key reuse with a *different*
payload — the spec only defines same-key-same-payload behavior, so the mismatch case is a
defensible TODO rather than required scope; a stored response snapshot for replay — unnecessary
once the `transfer` row itself has everything needed to re-serialize the original `201`.
`account.owner_name` is kept (it's on the `account` table, not cut) — it's a UX addition beyond
the spec's bare balance + currency requirement, but a worthwhile one for the accounts screen.

---

### 8. Schema migration: Flyway, run identically against Postgres and H2

**Context**: §7 committed to Flyway over `ddl-auto: update`. Since tests run on H2 rather than
Testcontainers-backed Postgres (root README's testing decision), the migration itself needed to
either target both engines, or tests needed to fall back to a Hibernate-autogenerated schema
instead — the two would then risk silently drifting apart, exactly the trade-off Flyway is
supposed to remove.

**Options**:
- Hibernate-autogenerated schema for tests, Flyway only for the real datasource
- One Flyway migration, run against both real Postgres and H2 in PostgreSQL-compatibility mode
  (`MODE=PostgreSQL`) — chosen

**Decision**: one migration (`V1__init.sql`), Postgres-and-H2-portable, applied by Flyway in both
environments; `ddl-auto=validate` everywhere (Flyway owns schema, Hibernate just checks the
entity mappings agree with it).

**Why**: the whole point of adding Flyway was a single source of truth for the schema — a second,
Hibernate-derived schema for tests would have undermined that while adding no real benefit H2's
PostgreSQL mode doesn't already give for free. It also recovers a slice of the value the earlier
Testcontainers option was rejected for: the actual migration script gets exercised in CI, not
just believed to be correct.

**Two things this surfaced in practice, both worth knowing before hitting them blind**:
- **Spring Boot 4 does not autoconfigure Flyway from `flyway-core` alone.** It split Flyway's
  autoconfiguration out of `spring-boot-autoconfigure` into a dedicated
  `org.springframework.boot:spring-boot-flyway` module (part of the broader 4.0 split of the old
  monolithic autoconfigure jar). Without it, Flyway never runs — silently: no error, no log line,
  nothing in the condition-evaluation report at any log level. The schema then simply doesn't
  exist and every persistence operation fails somewhere else entirely, in a way that doesn't
  point back at Flyway at all. Confirmed by running the test suite with `logging.level.org.flywaydb=DEBUG`
  and `debug=true` before and after adding the module — zero related log lines before, full
  migration output after.
- **H2, even in `MODE=PostgreSQL`, doesn't support partial/filtered indexes.** An index like
  `create index ... on transfer(created_at) where notified_at is null` — valid, idiomatic
  Postgres — fails with a `42000` syntax error on H2 2.4. Confirmed by actually running the
  migration against H2 rather than assuming compatibility-mode coverage; found by testing, not
  by reasoning about it in advance. Replaced with a plain composite index on
  `(status, notified_at)`, which fits the outbox publisher's real query (#5) at least as well.

**Also decided alongside this**: primary keys (`account.id`, `transfer.id`) are generated in
application code (Hibernate's UUID generator), not via a database default expression
(`gen_random_uuid()` and equivalent). Sidesteps needing Postgres and H2 to agree on a UUID
default function at all, rather than relying on both supporting the same one.

---

### 9. `account.created_at`: an ordering column, added after the fact

**Context**: `GET /api/accounts` had no `ORDER BY`, so Postgres was free to return rows in
whatever order its query planner picked — not necessarily insertion order, and not guaranteed
stable across repeated queries with no data change at all. The frontend's `useSelectedAccount`
falls back to "the first account in the list" whenever nothing is stored yet (`ARCHITECTURE.md`),
so an unstable backend order meant the account a first-time user saw could change after some
unrelated cache invalidation — observed live (Playwright against the real backend), not from a
test.

**Options**:
- `ORDER BY id` — stable (UUIDs don't change), zero schema change, but the resulting order is
  arbitrary (alphabetical-by-UUID), not meaningful
- Add `created_at`, order by it — chosen

**Decision**: `account` gets a `created_at timestamp with time zone` column
(`V2__account_created_at.sql`), same shape and same "set once in the constructor via
`Instant.now()`" pattern `transfer.created_at` already uses. `AccountService.listAccounts()`
orders by it descending — newest account first.

**Why**: `ORDER BY id` would have fixed the *symptom* (order flip-flopping between requests)
without the result meaning anything — the most recently created account is a more natural
default to land on (the frontend falls back to "the first account in the list" whenever nothing
is stored yet) than whichever account happens to have the lexicographically smallest UUID.
Matching `transfer`'s existing `created_at` pattern also means one mental model for "how do
entities in this schema track when they were made," not two.

**Migrating existing rows**: `alter table account add column created_at ... default
current_timestamp` backfills every pre-existing row with the timestamp *the migration ran at* —
they all get the same value, so their relative order among each other is still arbitrary (ties
broken however Postgres breaks them). Not fixable after the fact; the data to reconstruct real
historical creation order was never captured. Every account created from this migration forward
gets a real, distinct `created_at`, which is what actually matters going forward.
