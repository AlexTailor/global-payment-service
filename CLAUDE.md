# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Nx monorepo with two apps:

- `apps/client` — React 19 + Vite + TypeScript, built with `@nx/react`/`@nx/vite`, tested with Jest.
  Stack: `@tanstack/react-query` + `axios` (data fetching), `react-hook-form` + `zod` +
  `@hookform/resolvers` (forms/validation), Tailwind CSS v4 + shadcn/ui on Base UI
  (styling/components, Nova preset, Lucide icons, Geist font).
- `apps/server` — Spring Boot 4 backend, Java 21, Gradle. Wired into the Nx project graph via
  the `@nx/gradle` plugin (`nx.json` → `plugins`), which introspects `apps/server/build.gradle`
  and exposes **every Gradle task as an Nx target** (`build`, `test`, `bootRun`, `bootJar`,
  `clean`, `assemble`, `check`, etc.) — there are no hand-written `project.json` targets for it.

No shared libraries exist yet; `libs/` is reserved for them.

## Prerequisites

- Node.js 22+ / npm
- Java 21+ JDK, with `JAVA_HOME` set and `$JAVA_HOME/bin` on `PATH` (Nx shells out to
  `apps/server/gradlew`, which needs `java` on `PATH` to run). On this machine that's
  `/opt/homebrew/opt/openjdk@21` (installed via `brew install openjdk@21`, keg-only —
  not symlinked into `/opt/homebrew`, so it won't be found unless exported).

## Commands

```sh
npm install                       # install JS deps (run once, or after touching apps/client or root package.json)

npx nx dev client                 # React dev server (Vite)
npx nx run server:bootRun         # Spring Boot app on :8080

npx nx run-many -t build          # build both apps
npx nx run-many -t test           # test both apps
npx nx affected -t build test     # only what changed vs. main

npx nx build client               # client only
npx nx run server:build           # server only (full Gradle `build`)
npx nx run server:test            # server only (Gradle `test`)

npx nx graph                      # visualize the project graph
npx nx reset                      # clear the Nx cache (use if project graph looks stale)
```

Any Gradle task name works as an Nx target on `server` (e.g. `npx nx run server:bootJar`,
`npx nx run server:clean`) without further configuration — that's what the `@nx/gradle`
plugin does. `apps/server` is also a normal Gradle project and can be driven directly with
`cd apps/server && ./gradlew <task>` when you want raw Gradle output instead of Nx's.

There is no linter configured for `client` (`nx.json` generators set `"linter": "none"`
for `@nx/react`), so `nx lint` is not a valid target here.

```sh
cd apps/client && npx shadcn@latest add <component>   # vendor a new shadcn/ui component
```

shadcn/ui components are copied into `apps/client/src/components/ui` as source (not an
npm dependency you version-bump) — `components.json` holds the style/alias config
(`@/*` → `apps/client/src/*`, configured in both `tsconfig.app.json` and `vite.config.mts`).

## Architecture notes

- **Two build systems, one task runner.** JS/TS targets come from Nx's own inferred-tasks
  plugins (`@nx/js/typescript`, `@nx/vite/plugin`, `@nx/jest/plugin`); JVM targets come from
  `@nx/gradle`, which runs a Gradle init script (`nxProjectGraph` task, wired into
  `apps/server/build.gradle` via the `dev.nx.gradle.project-graph` plugin) to discover tasks
  and dependencies. Both surface through the same `nx run-many` / `nx affected` graph, so
  `npx nx run-many -t build` builds the JAR and the Vite bundle in one call, correctly cached
  and parallelized.
- **Database**: `apps/server` runs on Postgres via `spring.datasource.*` in
  `application.properties` (`docker-compose.yml` at the repo root provides a matching local
  instance; `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` env vars override the
  defaults). `src/test/resources/application.properties` overrides that with no datasource URL,
  so Spring Boot's embedded-database autoconfiguration falls back to H2 for
  `ServerApplicationTests` — `nx run server:test` never needs Postgres or Docker running.
- **No Testcontainers**: intentionally removed from the Spring Initializr scaffold so `nx run
server:test` doesn't require Docker. Re-add `spring-boot-testcontainers` /
  `testcontainers-postgresql` deliberately if you want integration tests against real Postgres.
- **Workspace layout**: `apps/*` and `libs/*` are npm workspaces (see root `package.json`).
  Adding a new JS/TS project should go through an Nx generator (e.g. `npx nx g @nx/react:app
apps/<name>` or `@nx/js:lib libs/<name>`) rather than being hand-rolled, so it picks up the
  right inferred-task plugin wiring automatically.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
