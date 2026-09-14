# Running the app

This is written for a reviewer starting from nothing but a fresh clone of this repository —
every step needed to get both apps running and verify the three required screens, in order.
Architecture, technology choices, and the reasoning behind them live in the root `README.md`;
this file is just the "make it run" reference.

## 0. Prerequisites

- **Node.js 22+** and npm.
- **Java 21+ (JDK)**, with `JAVA_HOME` set and `$JAVA_HOME/bin` on `PATH` — Nx shells out to
  `apps/server/gradlew`, which needs `java` on `PATH` to run. On macOS:
  `brew install openjdk@21` (keg-only — not symlinked into `/opt/homebrew`, so
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` if `java -version` doesn't find it).
- **Docker** (Docker Desktop or equivalent), for the local Postgres instance — only needed to
  run the backend live; `nx run server:test` uses H2 and needs neither Docker nor Postgres.

Nothing else needs installing or configuring by hand: `apps/client/.env.development` already
points the frontend at `http://localhost:8080`, and `docker-compose.yml` already matches the
backend's default datasource settings.

## 1. Clone and install JS dependencies

```sh
git clone <this-repo-url>
cd global-payment-service
npm install                       # installs deps for both the Nx toolchain and apps/client
```

## 2. Start Postgres

```sh
docker compose up -d postgres     # Postgres 17, host port 5732 -> container 5432
```

No manual schema setup is needed — Flyway runs `apps/server/src/main/resources/db/migration/`
automatically the first time the backend boots against this database.

## 3. Start the backend

```sh
npx nx run server:bootRun         # Spring Boot on :8080
```

Wait for the "Started ServerApplication" log line, then confirm it's up:

```sh
curl -s localhost:8080/actuator/health   # {"status":"UP"} once Flyway has migrated the schema
```

Interactive API docs (useful for exercising the API directly, e.g. the `X-Idempotency-Key`
contract): `http://localhost:8080/swagger-ui/index.html`.

## 4. Start the frontend

In a second terminal:

```sh
npx nx dev client                 # Vite dev server on :4200
```

Open `http://localhost:4200` — the backend's `app.cors.allowed-origins` already permits this
origin by default (`apps/server/src/main/resources/application.properties`).

## 5. Smoke-test the three required screens

1. **Accounts** — create two accounts with different currencies (e.g. EUR and HUF) using the
   "new account" action; confirm both appear with their opening balances.
2. **Transfer** — start a transfer between those two accounts. Since the currencies differ,
   this exercises the mocked FX lookup; the flaky mock occasionally 503s/retries, so a transfer
   may take a couple of seconds or need a retry — that's the resilience behavior working as
   designed, not a bug (see the root README's "Key technical decisions").
3. **Transactions** — confirm the completed transfer shows up in the transaction list with the
   correct converted amount.

## 6. Build and test everything

```sh
npx nx run-many -t build          # build both apps
npx nx run-many -t test           # test both apps — server tests run against H2, no Docker needed
npx nx affected -t build test     # only what changed vs. main
```

## Reference: individual commands

```sh
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

## Troubleshooting

- **`nx run server:bootRun` fails to find `java`** — `JAVA_HOME`/`PATH` isn't set for this
  shell; see [Prerequisites](#0-prerequisites).
- **Backend can't connect to Postgres** — confirm `docker compose ps` shows `postgres` as
  `healthy`/`running`, and that nothing else on the host is already bound to port `5732`.
- **Frontend requests fail with a CORS error** — the frontend must run on port `4200` (Vite's
  configured default in `apps/client/vite.config.mts`); a different port isn't in
  `app.cors.allowed-origins` unless you override it via the `CORS_ALLOWED_ORIGINS` env var on
  the backend.

## Backend notes

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

## Frontend notes

`apps/client` is a React 19 + TypeScript SPA. Add more shadcn/ui components with:

```sh
cd apps/client
npx shadcn@latest add <component>
```

`@/*` resolves to `apps/client/src/*` (configured in `tsconfig.app.json` and `vite.config.mts`).
