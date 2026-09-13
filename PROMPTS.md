# AI usage

How AI was used on this assignment. Per the brief: what matters here isn't how much AI was
used, but how much of it was kept under control. This covers two phases with two different
tools: architecture planning in a Claude.ai chat, before this repo existed, and implementation
in Claude Code, once it did.

---

## How to read this

Each entry: what was asked → what the AI produced → what happened to it (accepted /
corrected / discarded, and why). Prompts are paraphrased for length, not verbatim transcripts,
except where quoted directly.

---

## Planning phase (Claude.ai chat, before this repo existed)

**Prompt**: "Analyze the interview task and create a high-level architecture based on my
expertise and the requirements in the doc."
**Produced**: a layered diagram (React frontend → Spring Boot API/domain/data layers →
external FX API → downstream Fraud/Notification systems) and an initial package-level plan.
**Outcome**: *accepted as the starting shape.* Explicitly flagged the mismatch between my
daily stack (Node/NestJS) and the assignment's mandated Java/Spring Boot — used that to decide
where extra care was needed (the parts furthest from muscle memory: FX resilience,
idempotency-under-concurrency) rather than taking the stack choice itself as a suggestion to
second-guess.

**Prompt**: "Start to plan a more in-depth architecture for the backend — everything I need
as an example to code it."
**Produced**: package layout, entity/DDL definitions, API contract with status codes, the
idempotency algorithm, FX resilience config, an outbox-pattern design for event propagation,
a testing plan, and a suggested build order.
**Outcome**: *accepted the shape, corrected significantly later* — see below. At this point
the DB design was 4 tables (`account`, `transfer`, `idempotency_record`, `outbox_event`),
following the textbook version of each pattern as its own entity.

**Prompt**: "Is CQRS a good addition to this backend architecture?"
**Produced**: a recommendation against full CQRS/event sourcing at this scope (irrelevant read
scaling need, adds an eventual-consistency problem where the assignment is specifically testing
single-write-model atomicity), with a lightweight command/query service split suggested instead.
**Outcome**: *accepted*, with the reasoning carried into the README and decision log largely
as given — this was the one place I let the AI's judgment stand closest to verbatim, because
the trade-off (independent scaling / audit trail vs. added consistency risk) matched my own
read of the assignment's actual grading focus (atomicity and locking on one model).

**Prompt**: "Focus on the database structure — what is necessary to meet every criteria?"
**Produced**: a re-derivation of the schema, column by column, against the assignment's literal
requirements. This is where the AI's *own earlier* 4-table design got corrected: `idempotency_record`
and `outbox_event` collapsed into two columns (`status`, `notified_at`) on `transfer` itself,
because neither separate table was actually earning its keep at this scope (one endpoint, one
event type). It also flagged several columns from its own earlier draft as not actually required
by the spec (`owner_name`, `request_hash`, a stored response snapshot for replay).
**Outcome**: *corrected the AI's own prior output, and the correction was accepted.* This is the
clearest case in this log of not taking a first answer at face value — asking it to justify each
piece of its own earlier schema against the stated criteria surfaced real over-engineering. Final
schema (2 tables) folded back into `server/README.md` and `DECISION-LOG.md`.

**Prompt**: "Put it in the readme" (recurring, after each decision above).
**Produced**: `README.md`, `DECISION-LOG.md`, and `server/README.md` — the first two written
directly from the decisions made in-chat, the third as the coding blueprint.
**Outcome**: *accepted the drafting*, reviewed for accuracy against what was actually decided
rather than what reads well — one round of edits was needed after the database simplification
above to keep all three docs internally consistent (the summary lines in `README.md` and
`DECISION-LOG.md` initially still described the 4-table version after `server/README.md` had
already moved to 2).

These three documents — still describing a design, no code yet — are what the Claude Code
implementation phase below started from.

---

## Implementation phase (Claude Code, in this repo)

Once the Nx workspace was scaffolded (React app + Spring Boot via `@nx/gradle`) and handed to
Claude Code, the pattern shifted: fewer big single "produce a design" prompts, more short
iterative ones, with verification between almost every step rather than at the end. The
workflow that emerged and then held for the rest of the build:

1. **Docs before code, reconciled against reality.** The Claude.ai-drafted docs above were
   checked against the *actual* scaffold (Gradle, not the drafts' assumed Maven; the scaffold's
   own `CLAUDE.md` had already ruled out Testcontainers, which a `server/README.md` draft still
   assumed) before any backend code was written, and re-reconciled each time the docs drifted
   from each other during iteration.
2. **One endpoint per commit.** Explicitly requested ("build the api... one endpoint per
   creation... stick with the atomic commits") and followed for the rest of the backend: entity
   + repository + service + controller + tests for one endpoint, verified, then a single atomic
   commit, before moving to the next.
3. **Verify before committing, on both databases.** Every backend change was run through the H2
   test suite *and* booted live against the real Postgres container (`docker compose up -d
   postgres`) with `curl` before being committed — not just "tests pass." This is what caught
   two cross-database divergences that H2-only testing would have missed (see below).
4. **Plan mode + explicit questions at real forks.** For anything with a genuine trade-off, plan
   mode laid out the options and asked before choosing (the FX client's sync-vs-async shape, the
   idempotency transaction-boundary structure). For pure implementation-mechanics calls with no
   real trade-off, Claude decided and explained the reasoning afterward instead of stopping to
   ask.

Representative prompts and what happened to their output:

**Prompt**: "Check the attached readme which is about the whole project and mix it with the
actual readme."
**Produced**: a merge of the Claude.ai-drafted `README.md` above (tech stack, architecture,
decisions — written before any code existed) with the Nx-generated scaffold's actual layout.
**Outcome**: *accepted the merge, corrected several facts against the real scaffold* — the
planning doc said Maven; the actual setup was Gradle via `@nx/gradle`. It also still listed
Testcontainers as a testing decision, which the scaffold's own `CLAUDE.md` had already ruled
out in favor of H2-only tests.

**Prompt**: "So time to setup the database."
**Produced**: the Flyway migration and datasource config for both Postgres and H2.
**Outcome**: *corrected three times before it actually worked.* (1) `docker-compose.yml` mapped
the remapped host port to itself (`5732:5732`) instead of to Postgres's real internal port —
found by actually starting the container, not by reading the compose file. (2) A partial index
(`create index ... where notified_at is null`) is valid Postgres but fails on H2 with a syntax
error, even in `MODE=PostgreSQL` — found by running the migration against H2, not by trusting
compatibility-mode coverage. (3) Spring Boot 4 silently no-ops Flyway without the
`spring-boot-flyway` module on the classpath — no error, no log line, just no schema — found by
checking that migrations actually ran rather than assuming they did because the build succeeded.

**Prompt**: "Continue the implementation from here, ask questions and don't push anything
before I review the changes" (idempotency).
**Produced**: `TransferPersistence`, a separate bean holding the three transactional primitives
the idempotency algorithm needs.
**Outcome**: *the separate-bean structure was a question, not a default* — plan mode surfaced
that `TransferService` calling its own `@Transactional` methods internally would silently
bypass Spring's proxy (self-invocation isn't intercepted), and asked whether to fix this with a
second bean, a `@Lazy` self-injection workaround, or accept weaker guarantees with one big
transaction. The second bean was chosen. Separately, an early version of the claim/reclaim
logic considered catching the unique-constraint violation and reading back the existing row
*within the same transaction* — reasoning through it surfaced that a failed statement aborts
the whole transaction on real Postgres (any later statement fails too, even a `SELECT`), so it
was split into two transactions before being written at all, not corrected after.

**Prompt**: "For the first one don't waste resources, try to delegate the necessary stuff for
Resilience4j and resolve the rate once."
**Produced**: a redesign moving FX-rate resolution out of the optimistic-lock retry loop
entirely, so a lock-conflict retry never re-invokes the FX client or risks resolving a second,
different rate for the same attempt.
**Outcome**: *accepted*, and generalized into a standing rule (`DECISION-LOG.md`'s note on the
FX call being resolved exactly once per attempt) applied again later when FX was actually wired
in.

**Prompt**: "Swagger is installed?"
**Produced**: `springdoc-openapi-starter-webmvc-ui` added, after checking Maven Central directly
rather than guessing a version — the 2.x line targets Spring Boot 3, the 3.x line Spring Boot 4.
**Outcome**: *accepted*, verified live (`/swagger-ui/index.html`, `/v3/api-docs`) before
committing.

**Prompt**: "Continue and ask if it's needed" (FX resilience).
**Produced**: the question of whether `ExchangeRateClient` should be synchronous (simpler) or
return `CompletableFuture<BigDecimal>` (needed for Resilience4j's `@TimeLimiter` to apply at
all — it only works on async-returning methods).
**Outcome**: *async chosen* — TASK.md names delays specifically as a failure mode to handle, and
a real timeout guard is a stronger answer than explaining around its absence. The synchronous
option was the one *not* taken (see Discarded suggestions).

**Prompt**: "Continue the implementation and after take care about the documentation of the
mentioned stuff."
**Produced**: the outbox publisher (`TransferEventPublisher`/`TransferNotifier`), then this
file, the "Going to production" section, and a consolidated testing summary in `README.md`.
**Outcome**: *accepted*, including moving `@EnableScheduling` off the main application class
onto a profile-gated config after noticing a real background poller running during tests could
race a test's own assertion about `notified_at` — caught while writing the test, not after it
flaked.

---

## Discarded suggestions

None outright discarded at the planning stage — that phase's pattern was *correcting* scope
(see the database-structure entry above) rather than throwing an answer away entirely.
During implementation, a few concrete alternatives were surfaced and not taken:

- **Synchronous `ExchangeRateClient`, skip `@TimeLimiter`.** Simpler interface, and defensible
  (the mock's simulated latency is self-bounded, so nothing can truly hang) — but that argues
  the timeout is *safe* to skip, not that the assignment's delay-handling requirement is
  actually met. Not built.
- **`@Lazy` self-injection instead of a separate `TransferPersistence` bean**, to route
  self-invoked calls back through Spring's proxy without a new class. Works, but is a known
  code smell most reviewers would flag; the plain second-bean design was built instead.
- **One transaction for the whole idempotency claim-and-branch step**, catching its own
  unique-constraint violation and reading back inline. Simpler, and would have passed the H2
  test suite — but reasoning through real-Postgres transaction-abort semantics before writing
  it ruled it out; never actually built to compare against.
- The original planning-phase sketch of `ExchangeRateClient.getRate(String from, String to)`
  (see above) was superseded once implementation actually started: `Currency` instead of
  `String` (the enum already exists everywhere else in the domain), and async instead of
  synchronous (see the `@TimeLimiter` entry above).

---

## Tooling built around this work

- **Claude.ai chat** — used for the architectural planning phase above: reading the assignment
  doc, working through trade-offs (CQRS, the database schema), and drafting the initial
  `README.md`/`DECISION-LOG.md`/`server/README.md`.
- **Claude Code** — daily driver for implementation. No custom subagents or MCP servers were
  built specifically for this exercise; the tools that mattered were built-in:
  - **Plan mode**, for the multi-file documentation reconciliation passes and for the FX/
    idempotency architecture forks (see above) — lays out research and options before any file
    is touched, and requires explicit approval before execution.
  - **`CLAUDE.md`** (repo root, present from the Nx workspace scaffold, not written for this
    exercise) — project-level guidance for Nx conventions and which built-in Nx skill to use for
    workspace navigation vs. scaffolding. Genuinely used throughout: `npx nx run server:test`
    and `npx nx run server:build` were how every change in this log was actually verified.
  - **`AGENTS.md`** (repo root) — the same Nx guidance in the generic format some tooling reads
    instead of `CLAUDE.md`.
  - **`.github/skills/*` and `.claude/settings.json`** — the Nx Claude Code plugin
    (`nrwl/nx-ai-agents-config`) that ships the `nx-workspace`, `nx-generate`, `nx-run-tasks`,
    `nx-import`, `nx-plugins`, and `monitor-ci` skills referenced by `CLAUDE.md`. Pre-existing
    infrastructure from the Nx scaffold, not assembled for this exercise, but real tooling this
    session relied on for correct Nx usage instead of guessing CLI flags.

Left in the repo per the assignment's own instruction that AI-workflow config is a signal, not
noise.
