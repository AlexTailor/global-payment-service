# AI usage

Built with Claude Code (Claude, Anthropic) throughout — architecture, docs, and implementation.
Per the assignment's own framing, this file is about how the AI use was kept controlled and
deliberate, not how much of it there was.

## Workflow

The shape that emerged, applied consistently once it did:

1. **Docs before code.** The three planning documents (`README.md`, `server/README.md`,
   `DECISION-LOG.md`) were drafted and cross-checked against each other and against `TASK.md`
   *before* writing the backend — including several dedicated passes asking Claude to find
   contradictions between them (e.g. one doc still assuming Testcontainers after the root README
   had already ruled it out; a server README draft that reverted to an earlier package name).
   Reconciling these caught real design gaps early (see below) rather than discovering them
   mid-implementation.
2. **One endpoint per commit.** Explicitly requested and then followed for the rest of the
   build: entity + repository + service + controller + tests for one endpoint, verified, then a
   single atomic commit, before moving to the next. Kept each commit reviewable and bisectable.
3. **Verify before committing, on both databases.** Every backend change was run through the H2
   test suite *and* booted live against the real Postgres container (`docker compose up -d
   postgres`) with `curl` before being committed — not just "tests pass." This is what caught the
   two cross-database divergences below; H2-only testing would have missed both.
4. **Plan mode + explicit questions at real forks.** For anything with a genuine trade-off (not
   just an implementation detail), Claude used plan mode to lay out the options and asked before
   choosing — see the fork log below. For pure implementation-mechanics calls with no real
   trade-off (e.g. exception package placement, DTO shape), Claude decided and explained the
   reasoning afterward instead of stopping to ask.

## Where AI output was corrected or overridden

- **The FAILED→PROCESSING retry had a real concurrency bug.** An early version of the idempotency
  algorithm (drafted collaboratively, iterated in `server/README.md`) reused a failed transfer
  row on retry via a bare `UPDATE ... WHERE id = ?`. Reviewing it surfaced that this isn't a
  compare-and-swap — two concurrent retries could both "succeed" at the update and both execute
  the transfer. Fixed by adding `AND status = 'FAILED'` and checking the affected-row count,
  documented in `DECISION-LOG.md` #2.
- **A drafted Flyway migration used syntax that only works on one of the two databases.**
  `create index ... where notified_at is null` (a partial index) is valid Postgres but fails on
  H2 — even in `MODE=PostgreSQL` — with a `42000` syntax error. Found by actually running the
  migration against H2, not by reasoning about compatibility-mode coverage in advance. Replaced
  with a plain composite index; see `DECISION-LOG.md` #8.
- **Spring Boot 4 silently no-ops Flyway without an extra module.** `flyway-core` alone on the
  classpath produces no error, no log line, and no schema — `spring-boot-flyway` has to be added
  explicitly (Spring Boot 4 split Flyway's autoconfiguration out of the monolithic
  `spring-boot-autoconfigure`). Found the same way: by checking that migrations actually ran,
  not assuming they did because the build succeeded.
- **A "looks concurrent" test wasn't actually exercising the code path it claimed to.** A test
  named for proving the optimistic-lock retry fires under contention passed even after
  temporarily removing the retry's diagnostic logging showed it never actually retried across
  five runs — two real threads mostly just serialize cleanly rather than genuinely interleaving.
  Replaced the claim in the test's docstring and added a separate deterministic unit test
  (mocking the persistence layer to force the conflict) to actually prove the retry logic works,
  rather than trusting a test that looked right but wasn't proving what its name said.
- **`docker-compose.yml`'s port mapping was backwards after a manual edit.** The user had changed
  Postgres's host port from 5432 to 5732 in both `docker-compose.yml` and
  `application.properties`, but mapped `5732:5732` — Postgres always listens on 5432 *inside* the
  container regardless of the host port choice. Caught while setting up the database, fixed to
  `5732:5432`.

## Where a real trade-off was surfaced and the user chose

- **Testcontainers vs. H2-only for backend integration tests** — kept H2-only, consistent with
  the already-stated goal of a Docker-free `nx run server:test`.
- **`ExchangeRateClient` sync vs. async** — chosen: async (`CompletableFuture<BigDecimal>`),
  specifically so Resilience4j's `@TimeLimiter` (the tool for the "delays" half of the flakiness
  requirement) can actually apply; a synchronous method can't be time-limited by it at all.
- **How to structure the idempotency claim/execute transaction boundaries** — chosen: a separate
  `TransferPersistence` bean rather than self-invoked `@Transactional` methods on `TransferService`
  itself, which would have silently done nothing (Spring's proxy-based AOP doesn't intercept
  self-invocation).
- **Commit granularity and timing** — chosen: atomic local commits per logical step throughout,
  except for the idempotency rewrite specifically, which the user asked to review as a whole
  diff before it was committed.
- **Whether `GET /api/transfers` should expose `FAILED` rows** — chosen: yes, with `status`
  visible, since the redesigned data model persists a real row for every attempt regardless of
  outcome.

## Tooling around the work

- **Claude Code** (this tool) for everything above — no separate custom subagents or MCP servers
  were built specifically for this exercise.
- **Plan mode** (built into Claude Code) for the multi-file documentation reconciliation passes
  and for the FX/idempotency architecture forks — lets Claude lay out research and options before
  any file is touched, and requires explicit approval before execution.
- **`CLAUDE.md`** (repo root, already present from the Nx workspace scaffold) — project-level
  guidance for Nx conventions, which of the built-in Nx skills to use for workspace navigation
  vs. scaffolding, and when to consult `nx_docs`. Left in place; not written for this exercise
  specifically, but genuinely used throughout (e.g. `npx nx run server:test`,
  `npx nx run server:build` were how every change was verified).
- **`AGENTS.md`** (repo root) — the same Nx guidance in the generic `AGENTS.md` format some
  tooling reads instead of `CLAUDE.md`.
- **`.github/skills/*` and `.claude/settings.json`** — the Nx Claude Code plugin
  (`nrwl/nx-ai-agents-config`, enabled in `.claude/settings.json`) that ships the `nx-workspace`,
  `nx-generate`, `nx-run-tasks`, `nx-import`, `nx-plugins`, and `monitor-ci` skills referenced by
  `CLAUDE.md`. Pre-existing infrastructure from the Nx scaffold, not assembled for this exercise,
  but real tooling this session relied on for correct Nx usage rather than guessing CLI flags.

Left in the repo per the assignment's own instruction that AI-workflow config is a signal, not
noise.
