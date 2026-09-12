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
table.

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
