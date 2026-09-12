# Server — build blueprint

Spring Boot 4.x, Java 21, Postgres. This is the skeleton to code against — package layout,
data model, API contract, and the exact algorithms for the parts that matter (idempotency,
concurrency, FX resilience, event propagation). Whole-app decisions and why they were made
live in the root `README.md` and `DECISION-LOG.md`; this doc is the "start coding" reference
for the server specifically.

Cut whatever the 10-12h budget won't allow and log it in the root README's TODO section.

---

## 1. Package layout

```
com.globalpayment.server
├── ServerApplication.java
├── account
│   ├── Account.java                       (entity)
│   ├── AccountController.java
│   ├── AccountService.java
│   ├── AccountRepository.java
│   ├── AccountNotFoundException.java      (thrown by both account and transfer lookups, mapped to `404`)
│   └── dto/ (CreateAccountRequest, AccountResponse)
├── transfer
│   ├── Transfer.java                      (entity — also carries idempotency + notification state, see §2)
│   ├── TransferStatus.java                (enum: PROCESSING, COMPLETED, FAILED)
│   ├── TransferController.java
│   ├── TransferService.java               ← core orchestration + idempotency branching lives here
│   ├── TransferRepository.java
│   ├── TransferEventPublisher.java        (scheduled poller over notified_at, see §7)
│   ├── IdempotencyConflictException.java  (thrown by §4's two `409` branches)
│   ├── InsufficientBalanceException.java  (thrown by §5's balance check, mapped to `409`)
│   ├── InvalidTransferException.java      (cross-field validation the request DTO can't express
│   │                                        alone — same account both sides, currency not
│   │                                        matching the source account, cross-currency not yet
│   │                                        supported; mapped to `400`)
│   └── dto/ (TransferRequest, TransferResponse)
├── fx
│   ├── ExchangeRateClient.java           (interface — port)
│   ├── MockExchangeRateClient.java       (adapter, resilience annotations here — simulates the
│   │                                       flaky external API in-process, no real HTTP call or
│   │                                       separate mock server, see §6)
│   ├── TransientFxFailureException.java  (thrown by the mock to simulate a `503`; what
│   │                                       Resilience4j's retry/circuit-breaker react to)
│   └── ExchangeRateUnavailableException.java  (thrown once retries are exhausted, mapped to `503`)
└── common
    ├── GlobalExceptionHandler.java  (@ControllerAdvice)
    ├── ApiError.java
    └── Money.java                   (BigDecimal wrapper if you want one)
```

This mirrors the Nest module shape you already think in: `controller → service → repository`,
one feature folder per bounded concept. `fx` is separated out because it's the one place with
real external unreliability — keeping it as an isolated, swappable port/adapter is the thing
worth demonstrating. Idempotency bookkeeping and event propagation don't get their own packages
— see §2 for why they live on `Transfer` itself rather than as separate entities.

---

## 2. Data model

Two tables, not four. `idempotency_record` and `outbox_event` collapse into columns on
`transfer` — see `DECISION-LOG.md` #7 for the full reasoning (and #2 for what that means for the
retry path); the short version: one endpoint means one idempotency scope, and one event type per
transfer means the outbox table's only real job (make the event durable in the same commit as
the fact it describes) is just as well served by a nullable column on the row that commit
already writes.

**Implemented**: `src/main/resources/db/migration/V1__init.sql` (Flyway-managed — `ddl-auto` is
`validate`, not `update`, in both `application.properties` and the test config, see §9). That
file is the source of truth for the exact columns/indexes; two decisions worth calling out since
they aren't obvious from reading it:

- **Primary keys are generated in application code** (Hibernate's UUID generator on the entity),
  not by a database default expression. Skips the question of whether Postgres's
  `gen_random_uuid()` and H2's UUID function agree — they don't need to, since neither is ever
  called.
- **No Postgres-only syntax, including no partial/filtered index.** The migration runs
  unmodified against both real Postgres (docker-compose, prod) and H2 in PostgreSQL-compatibility
  mode (tests) — see §9 for why that matters. This was found the hard way: an earlier draft had
  `create index ... where notified_at is null` (matching real Postgres fine), which fails on H2
  with a syntax error even in `MODE=PostgreSQL` — H2 doesn't support filtered indexes. Replaced
  with a plain composite index on `(status, notified_at)`, which fits the publisher's actual query
  (§7) at least as well anyway.

Deliberately left out, with the reasoning for each in the root `README.md`'s "Key technical
decisions" table: a `request_hash` column for detecting idempotency-key reuse with a
*different* payload (the spec only defines same-key-same-payload behavior — log the mismatch
case as a TODO instead, see §3), and any stored response snapshot for replay (the `transfer`
row already has everything needed to re-serialize the original `201`).

---

## 3. API contract

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/accounts` | body: `{ ownerName, currency, initialBalance }` → 201 |
| `GET`  | `/api/accounts` | list |
| `GET`  | `/api/accounts/{id}` | 404 if missing |
| `POST` | `/api/transfers` | requires `X-Idempotency-Key` header; body: `{ fromAccountId, toAccountId, amount, currency }`. `currency` must equal `fromAccount.currency` (see validation below); the target currency is always `toAccount.currency`, so a cross-currency transfer is just "the two accounts happen to differ," not a separate field the client sets |
| `GET`  | `/api/transfers` | list, optionally `?accountId=`; returns every status (`PROCESSING`/`COMPLETED`/`FAILED`) with `status` in the response — a `FAILED` row is a real, queryable attempt, not hidden from the client |
| `GET`  | `/api/transfers/{id}` | single transfer |

`POST /api/transfers` response codes to implement deliberately:
- `201` — created, first time this key succeeded (or replay of a prior success)
- `409` — same key is currently `PROCESSING` (a true concurrent duplicate), **or** a retry of a
  previously-`FAILED` key lost the race to claim the row to another concurrent retry (see §4's
  guarded update) — either way, the client should retry again shortly
- `404` — `fromAccountId`/`toAccountId` doesn't exist (`AccountNotFoundException`, see §8)
- `503` — FX lookup failed after retries and no cached rate available
- `400` — validation: negative amount, same account on both sides, unknown currency, or
  `currency` not equal to `fromAccount.currency`

Not implemented: detecting a reused key with a *different* payload (would be a `422`) — that
needs the `request_hash` column that's deliberately left out in §2. Logged as a TODO rather
than half-building a status code the data model can't actually detect.

---

## 4. Idempotency — the actual algorithm

This is the piece most worth getting precisely right; sketch it before writing the
controller.

```
on POST /api/transfers:
  key = header["X-Idempotency-Key"]; reject 400 if missing
  validate: fromAccount/toAccount exist (404), currency == fromAccount.currency (400),
            amount > 0 and fromAccountId != toAccountId (400)

  try:
    insert into transfer (idempotency_key=key, ..., status='PROCESSING')
    // unique constraint on idempotency_key enforces this atomically — the DB is the lock
  catch unique_violation:
    existing = select * from transfer where idempotency_key = key
    if existing.status == 'PROCESSING':
        throw IdempotencyConflictException  // -> 409, genuine concurrent duplicate
    if existing.status == 'COMPLETED':
        return existing  // -> 201, safe replay — the row IS the response
    if existing.status == 'FAILED':
        rows = update transfer set status='PROCESSING'
               where id = existing.id and status = 'FAILED'
        if rows == 0:
            throw IdempotencyConflictException  // -> 409, another concurrent retry already claimed this row
        // else: this call now owns the retry, fall through to execution below

  // this call is now the one PROCESSING row for this key

  // resolve the rate ONCE, before any retry loop below. Resilience4j's own @Retry/
  // @CircuitBreaker/@TimeLimiter around getRate() (§6) already owns FX-flakiness retries —
  // nothing past this point calls the FX client again for this attempt
  try:
      rate = (source_currency == target_currency) ? 1
             : exchangeRateClient.getRate(source_currency, target_currency)
  catch ExchangeRateUnavailableException:
      update this row set status='FAILED'
      rethrow / map to 503

  // apply the already-resolved rate — the ONLY part retried on OptimisticLockException
  // (bounded, §5). A retry re-reads the current account balances but reuses this same
  // `rate`; it never touches the FX client
  try:
      debit fromAccount by amount; credit toAccount by amount * rate   // one @Transactional
      update this row set status='COMPLETED', exchange_rate=rate
      return this row  // -> 201, controller sets the status
  catch OptimisticLockException:
      retry this block (bounded, §5) — same `rate`, same claimed row, fresh account reads
  catch any other exception:
      update this row set status='FAILED'
      rethrow / map to error response
```

`TransferService` never returns or throws an HTTP status — everywhere above that says `-> 4xx`
means "throw the matching domain exception" (`IdempotencyConflictException`,
`AccountNotFoundException`, `InsufficientBalanceException`, `ExchangeRateUnavailableException`);
everywhere that says `-> 201` means "return the `Transfer`, the controller's
`@ResponseStatus(HttpStatus.CREATED)` handles the rest." `GlobalExceptionHandler` (§8) is the
only place that turns an exception into a status — that's the whole reason it exists, and having
this method return raw status codes at the top would go around it.

The insert-first-then-branch-on-conflict shape is what actually closes the race: two
concurrent requests with the same key both attempt the insert, the DB's unique constraint
lets exactly one through, and the loser reads back a state that already reflects the winner's
progress. Don't implement this as "check-then-insert" — that has the same race the whole
requirement exists to prevent.

**The `FAILED → PROCESSING` update needs the `and status = 'FAILED'` guard and an
affected-row check** — a bare `update ... where id = existing.id` isn't enough. An `UPDATE`
doesn't fail just because another transaction already changed the row a moment earlier, so
without the guard, two concurrent retries of the same failed key could both "succeed" at the
update and both go on to execute the transfer — double processing, the exact thing idempotency
exists to prevent. The guard turns the update into the same kind of exactly-one-winner check
the initial `insert` already gets for free from the unique constraint; `rows == 0` means this
request lost that race and should back off like any other `409`.

**One transaction-boundary detail that matters**: the spec wants a genuinely fast `409` while
the first request is still mid-flight, not a second request that blocks until the first
finishes and only then finds out it lost. That means the initial
`insert ... status='PROCESSING'` (and the `FAILED → PROCESSING` update above) needs to commit
in its own short transaction *before* the slow work (the FX call, the debit/credit) starts —
otherwise Postgres's row lock on the not-yet-committed write just makes the second request
wait instead of returning `409` promptly. So this is three boundaries in `TransferService`, not
one: a fast `@Transactional` to claim the key, a plain (non-transactional) call to resolve the
rate, and a separate `@Transactional` to apply it — see below for why the rate call sits outside
both transactions.

**The FX call is resolved once and sits outside the retry loop, on purpose.** `TransferService`
already delegates FX-flakiness handling to Resilience4j (`@Retry`/`@CircuitBreaker`/
`@TimeLimiter` around `getRate()`, §6) — that's the mechanism that's supposed to absorb the
mocked API's 503s and latency, and it's wasted effort to build a second, overlapping retry
around the same call. So `getRate()` is called exactly once per attempt, its result held in a
local variable, and only the debit+credit+status-update step — the part that actually touches
`account.version` — is wrapped in the `@Transactional` method that gets retried on
`OptimisticLockException` (§5). A lock-conflict retry re-reads the accounts and re-applies the
same already-resolved `rate`; it never calls `getRate()` again. Two independent retry policies
stacked on one call would be redundant at best (Resilience4j is already the right tool for FX
flakiness) and incoherent at worst (a mocked-random rate resolving to a different value on each
lock retry, for a `Transfer` row that can only record one `exchange_rate`).

Test this with a real concurrency test: fire the same request twice in parallel
(`CompletableFuture` + `ExecutorService`, against the app's normal H2 test datasource — see
§9) and assert exactly one `Transfer` row was created and the account balance moved exactly
once. Do the same starting from a `FAILED` row to exercise the guarded update above.

---

## 5. Concurrency on the account balance

Independent of idempotency — this handles *different* idempotency keys hitting the *same*
account at once (e.g. two different transfers both debiting account A).

**Decided: optimistic locking**, not pessimistic — full reasoning and the rejected
`SELECT ... FOR UPDATE` alternative are in `DECISION-LOG.md` #3. Concretely:

- Add `@Version` to `Account.balance`'s entity (the `version` column above). JPA will throw
  `OptimisticLockException` on a conflicting concurrent update.
- In `TransferService`, wrap **only** the debit+credit+status-update step in a single
  `@Transactional` method — not the FX lookup, which already happened once beforehand (§4).
  Catch the optimistic-lock failure at the call site and retry that same method a bounded
  number of times (2-3) with a short backoff, passing in the same already-resolved rate each
  time, before surfacing a `409`/`503` to the client.
- **The insufficient-balance check must read `fromAccount.balance` fresh, inside this same
  retried method** — not a value read earlier (e.g. during the phase-1 validation, before the
  row was even claimed). Optimistic locking's whole guarantee comes from re-reading the entity
  on every attempt; checking sufficiency against a balance cached from an earlier step would
  silently defeat that guarantee and let an overdraft slip through on the very race this
  mechanism exists to prevent.

---

## 6. FX rate client — resilience

```java
public interface ExchangeRateClient {
    BigDecimal getRate(String from, String to);
}
```

`getRate(from, to)` returns units of `to` per 1 unit of `from` — e.g. `getRate("USD", "EUR")` ≈
`0.92`, so `amount_usd × rate = amount_eur`. That's the direction §4's `credit toAccount by
amount * rate` assumes; get this backwards and every cross-currency transfer silently credits
the wrong amount.

**Decided: the flaky external API is simulated in-process, not a real separate service.**
`MockExchangeRateClient` computes a rate and, before returning it, randomly throws
`TransientFxFailureException` (simulating a `503`) and/or sleeps a random duration (simulating
latency), at rates tuned to actually exercise the retry/circuit-breaker/timeout below — no real
HTTP call, no WireMock/stub server, nothing added to `docker-compose.yml`. The client code
reacting to a thrown exception behaves identically whether that exception came from a socket or
from `Math.random()`, so this gets the same resilience-testing value TASK.md is after for a
fraction of the scope: no second process to build, start, keep alive, or wire into Docker
Compose for local runs and tests alike.

Implementation wraps the flaky mock with Resilience4j:

```yaml
resilience4j.retry.instances.fx:
  max-attempts: 3
  wait-duration: 200ms
  retry-exceptions: [com.globalpayment.server.fx.TransientFxFailureException]

resilience4j.circuitbreaker.instances.fx:
  sliding-window-size: 10
  failure-rate-threshold: 50
  wait-duration-in-open-state: 5s

resilience4j.timelimiter.instances.fx:
  timeout-duration: 2s
```

Annotate the adapter method with `@Retry`, `@CircuitBreaker`, `@TimeLimiter` (name = `"fx"`),
and define a `@Bean` fallback: return a short-lived cached last-known rate if you have one, or
raise `ExchangeRateUnavailableException` mapped to `503` if you don't. **Decided**: a failed
FX lookup marks the already-`PROCESSING` `Transfer` row `FAILED` (§4) rather than leaving it
half-applied — the row persists, is retryable via the same idempotency key (with the guard
from §4), and stays visible in `GET /api/transfers` (§3). This only holds because the FX call
happens *before* any debit/credit — never resolve the rate after money has started moving.

**`getRate()` is called exactly once per transfer attempt.** This annotated method is the only
retry mechanism that should ever touch it — Resilience4j owns FX-flakiness handling completely.
The account-balance optimistic-lock retry (§5) is a separate concern (contention on `Account`,
not FX unreliability) and must not re-invoke this method; it reuses the rate already resolved
here. See §4 for how the two retry loops stay scoped to their own transactional steps.

---

## 7. Propagating successful transfers (Fraud/Notification)

Same durability guarantee as a transactional outbox, without a separate outbox table:

1. The transaction that flips `transfer.status` to `COMPLETED` (§4) leaves `notified_at`
   null — no extra write needed, it's the same row, same commit.
2. A `@Scheduled(fixedDelay = 1000)` `TransferEventPublisher` polls
   `where status = 'COMPLETED' and notified_at is null`, POSTs each to a configurable webhook
   (or logs it, for the scope of this exercise — say explicitly in the README which you did),
   and sets `notified_at` on success.
3. If publishing fails, leave `notified_at` null — retried on the next poll. At-least-once
   delivery; note in the README that consumers need to be idempotent on `transfer id` if this
   went further.

Why not a separate `outbox_event` table: that pattern earns its keep once one commit can
produce *multiple* event types across multiple aggregates. Here there's exactly one event
type (`TRANSFER_COMPLETED`) and a strict 1:1 relationship to `transfer` rows, so a nullable
column carries the identical "durable the instant the transfer commits" guarantee with one
fewer table and one fewer join. Worth naming in the README as the trigger to split it back
out: a second event type on the same transfer, or another aggregate needing the same pattern.

For 10-12 hours, a webhook call (or even a structured log line consumers could tail) is a
legitimate stand-in for Kafka/RabbitMQ — the durability guarantee is the part that actually
matters; the transport is swappable later.

---

## 8. Error handling

One `@ControllerAdvice` (`GlobalExceptionHandler`) mapping domain exceptions to HTTP status,
returning a consistent `ApiError { code, message, timestamp }` body. Keeps `TransferService`
free of HTTP concerns — it only ever throws domain exceptions or returns a `Transfer`; the
advice class is the *only* place that decides a status code (see §4's note on why nothing
upstream of it should).

| Exception | Status |
|---|---|
| `IdempotencyConflictException` | `409` |
| `AccountNotFoundException` | `404` |
| `InsufficientBalanceException` | `409` |
| `InvalidTransferException` | `400` |
| `ExchangeRateUnavailableException` | `503` |

`InvalidTransferException` covers what `@Valid` on the request DTO can't reach on its own (same
account both sides, `currency` not matching the source account, cross-currency not yet
supported) — anything needing the looked-up accounts. Bean validation (negative amount, missing
fields), an unparseable `currency` enum value, and a missing `X-Idempotency-Key` header are all
`400` via Spring's own default handling — no custom exception needed for those.

---

## 9. Testing plan

- **Unit** (JUnit 5 + Mockito): `TransferService` with a mocked `ExchangeRateClient` and
  repositories — same-currency transfer, cross-currency transfer, insufficient balance,
  FX failure path.
- **Integration** (`@SpringBootTest`, H2 — no Testcontainers, per the root README's decision to
  keep `nx run server:test` Docker-free): full `POST /api/transfers` through Spring Data JPA.
  The one thing this doesn't cover is Postgres-specific SQL, but the chosen locking mechanism
  (`@Version`/`OptimisticLockException`, §5) is enforced by Hibernate, not the database, so H2
  exercises the real code path — the earlier assumption that locking needs real Postgres was
  really about pessimistic `SELECT ... FOR UPDATE`, which isn't the path taken here. The test
  datasource (`src/test/resources/application.properties`) points H2 at
  `jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE` specifically so Flyway runs the
  *actual* `V1__init.sql` here too, rather than tests exercising a schema Hibernate
  auto-generated from the entities — the two could otherwise silently drift apart. This needed
  `org.springframework.boot:spring-boot-flyway` added explicitly (Spring Boot 4 split Flyway's
  autoconfiguration out of `spring-boot-autoconfigure` into its own module — `flyway-core` alone
  on the classpath silently does nothing, no error, no log line, easy to miss).
- **Concurrency test** (the one that actually proves the assignment's core requirement):
  fire the same idempotency key twice concurrently, assert one `201` + one `409`/replay, and
  exactly one balance change. Do the same for two different transfers hitting the same
  account, asserting the final balance is correct regardless of interleaving. Also cover the
  `FAILED → PROCESSING` race from §4: two concurrent retries of the same failed key must yield
  exactly one execution, never two.
- **Frontend**: RTL for the three screens' logic (form validation, optimistic UI on retry),
  one Cypress happy-path e2e (create account → transfer → see it in transactions).

---

## 10. Suggested build order

1. `Account` entity + repository + create/list endpoints — establishes the base and the DB
   setup (Flyway migration, H2 test config) that everything else depends on.
2. `Transfer` happy path (same-currency, no idempotency yet) — proves the domain flow end to
   end before adding resilience layers on top of it.
3. Idempotency (insert-first pattern + tests) — this is graded most heavily, do it before
   FX/events so it isn't rushed.
4. FX client + resilience annotations + cross-currency transfers.
5. Outbox + publisher.
6. Concurrency tests for both the idempotency race and the balance race.
7. Frontend, wired against a stable API.
8. README + PROMPTS.md last, while everything is fresh.

This order is also exactly what the README's "how did you start" question is asking you to
narrate — keep a short running note (a `NOTES.md` you delete before submitting, or your Claude
Code session log) while you go so you're not reconstructing your own reasoning at 11pm.

---

## 11. What's explicitly fine to cut, and put in the TODO instead

- Real message broker (Kafka/RabbitMQ) instead of the outbox+webhook stand-in.
- Auth/authz on the API (not mentioned as a requirement — say you skipped it and why).
- Multi-currency ledger reconciliation / double-entry bookkeeping rigor beyond what's needed
  for two accounts.
- Pagination on the transactions list.
- Rate limiting on the API itself.

Naming these explicitly, with a one-line reason each, is worth more in review than quietly
building a narrower version of each and hoping no one asks.
