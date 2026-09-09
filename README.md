# Global Payment Service

An Nx monorepo containing a React client and a Spring Boot backend.

## Structure

- `apps/client` — React app (Vite + TypeScript), built and tested through Nx.
  Stack: TanStack Query + axios (data fetching), react-hook-form + zod
  (forms/validation), Tailwind CSS v4 + shadcn/ui on Base UI (styling/components).
- `apps/server` — Spring Boot 4 backend (Java 21, Gradle), integrated into the Nx
  project graph via the `@nx/gradle` plugin. Every Gradle task (`build`, `test`,
  `bootRun`, `bootJar`, `clean`, ...) is automatically available as an Nx target.
- `libs/` — shared libraries (empty for now).

## Prerequisites

- Node.js 22+ and npm
- Java 21+ (JDK). On macOS: `brew install openjdk@21`, then make sure
  `JAVA_HOME` points at it and `$JAVA_HOME/bin` is on `PATH`.
- Docker (for the local Postgres instance used by `apps/server`).

## Common commands

```sh
# install JS dependencies
npm install

# run the React client dev server
npx nx dev client

# run the Spring Boot backend (http://localhost:8080)
npx nx run server:bootRun

# build everything
npx nx run-many -t build

# test everything
npx nx run-many -t test

# build/test only what changed relative to main
npx nx affected -t build test

# see the project graph
npx nx graph

# start local Postgres for apps/server
docker compose up -d postgres
```

## Backend notes

`apps/server` is a standard Gradle project and can also be driven directly with
its wrapper (useful when you want raw Gradle output):

```sh
cd apps/server
./gradlew bootRun
./gradlew test
```

It ships with Spring Web, Validation, Actuator, Spring Data JPA, Spring
Security and Lombok. Two datasources are wired in for two different purposes:

- **PostgreSQL** is the real datasource, configured via `spring.datasource.*`
  in `application.properties` (`docker-compose.yml` at the repo root brings up
  a matching local instance on `:5432`, default db/user/password
  `global_payment_service` / `postgres` / `postgres`; override with the
  `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` env vars for
  other environments).
- **H2** is only for tests: `src/test/resources/application.properties`
  overrides the main config with no datasource URL, so Spring Boot's
  embedded-database autoconfiguration falls back to H2 and `nx run
  server:test` never needs Postgres or Docker running.

## Frontend notes

`apps/client` is a React 19 + TypeScript SPA. Beyond that hard requirement,
everything is a choice — here's the stack and the reasoning:

- **Meta-framework: none (plain Vite SPA).** This is an API-backed
  dashboard/console for the Spring Boot service, not a content site — there's
  no need for SSR/SSG/RSC. Nx already provides the monorepo tooling a
  meta-framework would otherwise bring, so adding one (e.g. Next.js) would
  mostly duplicate routing/build concerns without buying anything.
- **Build tool: Vite**, via `@nx/vite`. Fast dev server and HMR, first-class
  Nx plugin support, and no framework lock-in since there's no meta-framework
  layered on top.
- **Component library: shadcn/ui on Base UI.** Components are copied into
  `src/components/ui` as source rather than pulled in as a versioned
  dependency, so they're fully ours to restyle/extend without fighting an
  upstream API. Base UI supplies accessible, unstyled primitives underneath.
- **Styling: Tailwind CSS v4.** Utility-first and pairs directly with
  shadcn/ui's generated components; avoids maintaining a separate CSS/theming
  layer.
- **Server state: TanStack Query.** Most of this app's state is server data
  (payments, balances, transaction history) rather than client-only UI state,
  so a caching/invalidation-aware query library covers the bulk of state
  management needs without pulling in a general-purpose store like Redux.
  Local UI state uses plain React state/context.
- **HTTP client: axios.** Interceptors make it straightforward to attach auth
  tokens and centralize error handling across a payments API surface.
- **Forms/validation: react-hook-form + zod** (via `@hookform/resolvers`).
  Uncontrolled-by-default forms keep re-renders low, and zod schemas double as
  a single source of truth for both validation and inferred TypeScript types.
- **Testing: Jest**, the `@nx/react` default. Mature ecosystem and jsdom
  support are enough for component/unit tests at this stage; no e2e runner is
  configured yet.

Add more shadcn/ui components with:

```sh
cd apps/client
npx shadcn@latest add <component>
```

`@/*` resolves to `apps/client/src/*` (configured in `tsconfig.app.json` and
`vite.config.mts`).
