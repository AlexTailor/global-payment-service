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
5. **One feature per stop, verified live, reviewed before committing.** This shifted again once
   actual frontend component code started (as opposed to the architecture-doc revisions above):
   build one feature slice — a compound component, a page-level integration — verify it
   (typecheck, build, tests, and, new for this phase, an actual headless-browser run against the
   live backend, not just mocks), then stop for review before committing rather than committing
   automatically. The live-browser step wasn't requested; it was added on the reasoning that a
   multi-feature integration point is exactly where mocked unit tests stop being sufficient
   evidence — and it caught two real bugs unit tests never could have (see below).

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

**Prompt**: "Time to create a high level architecture for the frontend — I made a UI mockup
[the `design-handoff/` bundle] — stick with the separations and folder structure I use in my
other projects."
**Produced**: the question of which folder-structure convention that meant (feature-sliced vs.
layer-based vs. something else) — there was no way to infer a personal convention from this
repo alone.
**Outcome**: *feature-sliced chosen*, `apps/client/ARCHITECTURE.md` written against it.

**Prompt**: "Use the new react related skills and refine the architecture also extend it with a
basic ui lib with the primitives and basic ui comps" (after `/reload-skills` surfaced
`vercel-composition-patterns`, `vercel-react-best-practices`, `vercel-react-view-transitions`,
`vercel-react-native-skills`).
**Produced**: `vercel-react-native-skills` was skipped (this is a responsive web app, not React
Native/Expo — a skill trigger existing isn't a reason to apply it). The other three were loaded;
`ARCHITECTURE.md` was revised to express `TransferFlow` and `AccountSwitcher` as compound
components with a provider-owned `{state, actions, meta}` interface (composition-patterns), plus
the versioned/try-caught `localStorage` schema and lazy-loading the two modals not needed on
first paint (react-best-practices). `vercel-react-view-transitions` was read but not applied —
there's no component code yet to animate.
**Outcome**: *accepted*. One thing corrected along the way: `TransferFlow.Failed` handling both
`409` and `503` inside one component could look like exactly the boolean/mode-prop pattern
composition-patterns warns against. It isn't — the branch reads already-resolved domain data
(`state.error.status`) off context, not a caller-supplied flag — but the distinction is easy to
miss, so `ARCHITECTURE.md` spells it out explicitly rather than leaving it implicit.

**Prompt**: "Clean the react app from the unnecessary basic stuff and after start to build the ui
component lib."
**Produced**: removed the Nx-generated welcome page and `react-router-dom` wiring (this app has
no router — every "screen" is a modal over one shell, per `ARCHITECTURE.md`), then the primitives
catalog from that doc: `Button`, `Input`, `Badge`, `Card`, `Modal`, `Skeleton`, `StatusIcon`,
`SegmentedControl`, each with a Storybook story.
**Outcome**: *accepted*, with one pre-existing environment problem fixed rather than routed
around: `tsconfig.app.json`'s `baseUrl` deprecation (TS5101) had been silently escalating to a
hard error since the initial scaffold commit, blocking `nx typecheck` for the whole project — it
just happened that nothing had relied on `nx typecheck` actually passing until now. Fixed with
TypeScript's own suggested `ignoreDeprecations` flag rather than removing `baseUrl` and
restructuring path resolution. Separately, jsdom has no `matchMedia` at all, which `useMediaQuery`
(and anything built on it, like `Modal`'s bottom-sheet/dialog swap) needs to run under Jest —
polyfilled in `test-setup.ts`.

**Prompt**: "Create all the necessary input fields in the ui component folder and after that
create a react-hook-form compatible version for them separately."
**Produced**: `Select` and `AmountInput` added to `components/ui/` (framework-agnostic, no
`react-hook-form` import anywhere in that folder), then `InputField`/`AmountInputField`/
`SelectField`/`SegmentedControlField` in a separate `components/form/`, each wrapping its
primitive in a `Controller`.
**Outcome**: *accepted*, after one library incompatibility was reproduced and confirmed before
working around it rather than assumed: Base UI's `Select` popup hangs indefinitely under jsdom —
confirmed by reproducing the exact same hang with the raw `@base-ui/react/select` primitives
directly, no wrapper of this codebase's own involved, before concluding it wasn't something to
fix here. `TransferFlow.spec.tsx` stubs `SelectField` with a plain native `<select>` for testing
purposes only; the real component used in the actual app is unaffected. Separately, `z.coerce
.number()` doesn't type-check cleanly against `zodResolver` + `useForm`'s generics in this zod/
resolvers version pairing (an input/output type mismatch) — worked around by keeping the amount
field a validated string and converting with `Number()` at submit time, which turned out simpler
than fighting the generics anyway.

**Prompt**: "Can you create a typography and use it instead of spans and inline text classes."
**Produced**: a `Typography` primitive (`body`/`caption`/`label`/`eyebrow`/`mono`/`amount`/`error`
variants), then applied across `TransactionRow`, `TransactionTable`, `AccountSwitcher*`, and the
three form field wrappers' error/hint text.
**Outcome**: *accepted*. The `error` variant wasn't speculative — it came directly out of noticing
the exact same `text-[11.5px] text-failure-text` string already hand-copied across three separate
field wrappers before this prompt. The primitive replaced duplication that already existed rather
than pre-empting duplication that might happen later.

**Prompt**: "Is everything ready to start implement the app or do I need to specify something?"
**Produced**: an audit of what was still missing before feature work could safely start — no
CORS or dev-proxy wiring existed yet between the client and the live backend, so nothing had
actually made a real network call up to this point.
**Outcome**: a choice was asked, not assumed — Vite dev-server proxy vs. CORS on the Spring Boot
side, since both are legitimate and the codebase gave no signal either way. The user picked CORS.
Verified live rather than trusting the config: preflight and real requests from the Vite origin
come back with `Access-Control-Allow-Origin`; a request from an untrusted origin gets none.

**Prompt**: "Go" (building `TransferFlow`, then `PageShell`).
**Produced**: the compound `TransferFlow` (`Provider` + `Form`/`Pending`/`Success`/`Failed`), then
`PageShell` wiring `AccountSwitcher`, the transaction list/table, and `TransferFlow` into the
actual running app for the first time.
**Outcome**: *accepted*, but only after live verification (see workflow point 5 above) caught two
things a mocked unit test structurally could not:
1. Selecting an account never closed the switcher panel. Its open state lives outside
   `AccountSwitcherContext` on purpose (owned by whoever renders `Modal.Root`, per the
   state-ownership table in `ARCHITECTURE.md`), so nothing told it to close — every unit test had
   rendered the panel pre-opened via `defaultOpen` and never actually exercised a real
   open-select-close cycle. Found by clicking through the running app in a real browser against
   the live backend. Fixed by wrapping the row in `Modal.Close`, which merges its dismiss
   behavior with the row's own `onSelect` handler.
2. Wiring `PageShell` pushed the main JS bundle to 596kB with the `TransferModal` async chunk
   almost empty (0.33kB) — `features/transfers/index.ts` had been re-exporting `TransferFlow` from
   the same barrel `PageShell` statically imports `TransactionList`/`TransactionTable` from,
   which defeated Rollup's code-splitting even though the `React.lazy()` call itself was correct.
   Found by reading the actual build output sizes, not by assuming a `lazy()` call is sufficient
   on its own. Fixed by removing that export — nothing outside the feature needs `TransferFlow`
   directly, only the already-lazy `TransferModal` wrapper, which imports it by relative path.

Two backend data gaps were disclosed rather than papered over with invented data: `Transfer` has
no reference field (the transfer's own id, truncated, stands in — the mockup's example format
happens to look exactly like a truncated UUID), and no failure reason is persisted for a `FAILED`
transfer (a generic "Transfer failed" line is shown instead of fabricating a cause the backend
never recorded).

**Prompt**: "Check for unexpected side effects and SOLID and DRY principle lacks."
**Produced**: a full pass over the client codebase — confirmed zero `useEffect` calls anywhere
(state is consistently derived during render, matching `ARCHITECTURE.md`'s stated intent, not a
coincidence), then a list of concrete DRY duplications (the field-wrapper markup repeated three
times, `TransferFlowSuccess`'s four detail rows, three variants of the same outlined-icon-circle
pattern across `Success`/`Failed`, `PageShell`'s header duplicated between its two branches) and
one real bug: `TransferFlowForm` bypassed `AmountInputField`'s own `hint` prop and re-implemented
the wrapper manually, which meant an error message and the hint text could render simultaneously
when the primitive's own logic treats them as mutually exclusive.
**Outcome**: findings reported, not yet applied as of this writing — the prompt asked to *check*,
not to fix, so nothing was changed pending a decision on which findings to act on.

**Prompt**: "The main user base is hungarian so rewrite the CTA's and the contents to hungarian
where is it possible."
**Produced**: every frontend-authored string translated — headers, buttons, validation messages,
empty states, badges, the screen-reader-only "Close" label on the generic `Modal`/`Dialog`
primitives — while deliberately leaving the brand name, the ISO currency codes, the already-locked
`€4,182.60`-style number-formatting spec, and `error.message` (verbatim from the Java backend's
exceptions, per the standing "show server messages as-is" decision) untouched.
**Outcome**: *accepted*. Verified live in a real browser at the narrowest supported width
specifically because Hungarian strings run noticeably longer than their English source — confirmed
no overflow anywhere, including a hint string in `TransferFlowForm` that wraps to two lines.

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
- **Layer-based frontend folders** (`components/`, `hooks/`, `api/` each holding every feature's
  files, grouped by filename rather than by folder) — a real option offered for the client
  architecture; feature-sliced was chosen instead as the closer match to the stated convention.
- **A full i18n library (`react-intl`/`i18next`) for the Hungarian localization.** Would make
  sense if the app needed to serve more than one language, but the actual ask was "the user base
  is Hungarian" — one target language, not a language switcher. Adding a translation-key
  abstraction layer for a second language nothing has asked for would be exactly the kind of
  unrequested infrastructure this project's own conventions argue against; strings were rewritten
  in place instead.

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
  - **`vercel-labs/agent-skills`** (`skills-lock.json`), added mid-project once frontend work
    started: `vercel-composition-patterns` (compound components, generic `{state, actions, meta}`
    context interfaces, explicit variants over boolean props) and `vercel-react-best-practices`
    (render/state-update hygiene, code-splitting) directly shaped `apps/client/ARCHITECTURE.md` —
    e.g. `TransferFlow`/`AccountSwitcher` as compound components with a provider owning the state
    interface, and the versioned/try-caught `localStorage` schema for the selected-account id.
    `vercel-react-view-transitions` was loaded early but never actually applied — true at the
    time it was written (no component code existed yet) and still true now that it does; it was
    simply never revisited once the component library and features were actually built. Not
    treated as a checklist item to force through regardless of fit. The vendored skill content
    itself (`.agents/`, `.claude/skills/*` symlinks) is gitignored — fetched by `/reload-skills`,
    not authored — but `skills-lock.json` (which skills, which versions) is committed, the same
    reasoning as a lockfile for any other dependency.
  - **Storybook** (`@nx/storybook`, `@storybook/react-vite`), added once the UI primitives catalog
    existed — every primitive in `components/ui/` got a story covering its documented variants, so
    the library is visually reviewable without wiring up the whole app.
  - **`react-use`**, swapped in for `useMediaQuery`'s implementation partway through (a user edit,
    not an AI suggestion) — moved from the root `package.json` to `apps/client/package.json`,
    since it's a client-only dependency and every other client runtime dependency already lived
    there.
  - **Playwright**, used ad hoc for the live-browser verification described in workflow point 5 —
    installed to a scratch directory and torn down after each use, not part of the committed
    toolchain. This is what actually caught the two `PageShell` bugs above and confirmed the
    Hungarian localization didn't overflow anywhere; a genuine case of a tool built for exactly
    one verification need rather than assumed to already be unnecessary because unit tests existed.

Left in the repo per the assignment's own instruction that AI-workflow config is a signal, not
noise.
