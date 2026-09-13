# Client architecture

High-level architecture for `apps/client`, derived from `design-handoff/README.md` (the UI spec)
and the tech stack already committed to in the root `README.md`/`DECISION-LOG.md`. Feature-sliced
folder structure, matching the convention used across other projects.

Component composition follows the patterns in `.claude/skills/vercel-composition-patterns`
(compound components, generic `{state, actions, meta}` context interfaces, explicit variants over
boolean props) and `.claude/skills/vercel-react-best-practices` (render/state-update hygiene,
code-splitting) — both cited inline below wherever they shaped a specific decision, not applied
as a blanket style mandate.

---

## Folder structure

```
apps/client/src/
├── main.tsx
├── styles.css                        Tailwind v4 @theme tokens (see "Design tokens" below)
├── app/
│   ├── app.tsx                       Root: QueryClientProvider -> <PageShell/>
│   └── query-client.ts               QueryClient instance + defaults
│
├── features/
│   ├── accounts/
│   │   ├── api/
│   │   │   └── accounts.api.ts       getAccounts(), createAccount(body)
│   │   ├── hooks/
│   │   │   ├── useAccounts.ts        useQuery(['accounts'])
│   │   │   ├── useCreateAccount.ts   useMutation -> invalidates ['accounts']
│   │   │   └── useSelectedAccount.ts selection state + versioned localStorage persistence
│   │   ├── components/
│   │   │   ├── AccountSwitcher.tsx        compound root — see "Compound flows" below
│   │   │   ├── AccountSwitcherContext.ts  {state, actions, meta} interface + createContext
│   │   │   ├── AccountSwitcherTrigger.tsx
│   │   │   ├── AccountSwitcherPanel.tsx   Modal-primitive body: list + search (desktop) + "New account"
│   │   │   ├── AccountSwitcherRow.tsx
│   │   │   └── NewAccountModal.tsx
│   │   ├── types.ts                  Account, CreateAccountRequest
│   │   └── index.ts                  public exports (only what other features import)
│   │
│   └── transfers/
│       ├── api/
│       │   └── transfers.api.ts      getTransfers(accountId?), createTransfer(body, idempotencyKey)
│       ├── hooks/
│       │   ├── useTransfers.ts       useQuery(['transfers', accountId])
│       │   └── useCreateTransfer.ts  useMutation; takes the idempotency key as a parameter (see below)
│       ├── components/
│       │   ├── TransactionList.tsx        phone card list
│       │   ├── TransactionTable.tsx       ≥768px table
│       │   ├── TransactionRow.tsx         shared row-data presentation (icon, copy, amount sign)
│       │   ├── StatusBadge.tsx
│       │   └── TransferFlow/              compound component — see "Compound flows" below
│       │       ├── TransferFlow.tsx           barrel: Provider + Root + Form + Pending + Success + Failed
│       │       ├── TransferFlowContext.ts     {state, actions, meta} interface + createContext
│       │       ├── TransferFlowProvider.tsx   owns step state, idempotency key, the mutation
│       │       ├── TransferFlowForm.tsx
│       │       ├── TransferFlowPending.tsx
│       │       ├── TransferFlowSuccess.tsx
│       │       └── TransferFlowFailed.tsx     one component; branches copy on error.status (not a caller-facing prop — see below)
│       ├── types.ts                  Transfer, CreateTransferRequest, TransferStatus
│       └── index.ts
│
├── components/
│   ├── ui/                           primitives — see "UI primitives library" below
│   ├── PageShell.tsx                 header + switcher slot + list/table slot + sticky footer
│   └── EmptyState.tsx                shared: no accounts / no transactions (design-handoff §6)
│
├── hooks/
│   └── useMediaQuery.ts              the one 768px query driving every responsive branch
│
├── lib/
│   ├── api-client.ts                 axios instance, base URL, ApiError-typed interceptor
│   ├── currency.ts                   formatCurrency(amount, currency) — the one helper, used everywhere
│   └── utils.ts                      existing (cn(), etc.)
│
└── types/
    └── api.ts                        ApiError — shared shape every 4xx/5xx body has
```

Two features (`accounts`, `transfers`) mirror the two backend resources one-to-one. Nothing else
earns a third feature folder at this scope — there's no third domain concept, just shared UI
(`components/`), cross-cutting hooks (`hooks/`), and infrastructure (`lib/`).

---

## Key architectural decisions

**No router.** The whole app is one page; every "screen" in the assignment's sense is a modal
over it (design-handoff's explicit structure). `react-router-dom` is a root-level dependency from
the Nx scaffold but isn't added to `apps/client/package.json` and won't be used — worth removing
from the root `package.json` as cleanup rather than leaving an unused dependency implying routing
exists.

**State has four distinct owners, not one store:**

| State | Owner | Why |
|---|---|---|
| `['accounts']`, `['transfers', accountId]` | TanStack Query | Server data — caching, refetch-on-invalidate, loading/error states come free |
| Selected account id | `useSelectedAccount` (React state + versioned `localStorage`) | Page-level context, not server data; survives a reload per design-handoff's "Interactions" section |
| Modal open/closed (`switcherOpen`, `transferOpen`, `newAccountOpen`) | Local `useState` in whichever component owns that modal | Pure UI state, no reason to lift it — nothing outside that modal reads it |
| The transfer flow's step + idempotency key | `TransferFlowProvider` (see below) | Must outlive individual `mutate()` calls (retries reuse the same key), so it can't live *inside* the mutation itself |

No global client-state library (Redux, Zustand, etc.) — matches the already-documented decision
that most of this app's state is server state (root `README.md`, "Frontend stack" decisions).

`useSelectedAccount` versions its storage key (`selectedAccountId:v1`) and wraps every read/write
in `try`/`catch` — `localStorage` throws in private browsing and when quota is exceeded, and a
version prefix means the schema can change later without a stale unversioned value crashing a
`JSON.parse` (`vercel-react-best-practices` → `client-localstorage-schema`). Falling back to "the
first account" when the stored id doesn't match any current account is **derived during render**,
not synced via a `useEffect` that calls `setState` — there's no separate piece of state to drift
(`rerender-derived-state-no-effect`).

**One API client function per write, and only one.** `createTransfer(body, idempotencyKey)` in
`transfers.api.ts` is the *only* place `POST /api/transfers` is called from — design-handoff is
explicit that this is what makes a missing header structurally impossible, not just
convention. `lib/api-client.ts` holds the shared axios instance (base URL, JSON headers) and an
interceptor that normalizes every error response into the `ApiError` shape (`types/api.ts`) so
calling code never touches Axios's own error wrapper.

**One breakpoint hook, not scattered `md:` classes, for structural swaps.** `useMediaQuery(
'(min-width: 768px)')` is the single source of truth for: the `Modal` primitive's bottom-sheet vs.
centered-dialog presentation, and TransactionList vs. TransactionTable. Tailwind responsive classes
still handle *styling* differences (padding, font size per the design-handoff's phone/tablet/
desktop tables) — but which *component* renders is a JS decision in one place, matching
design-handoff's explicit "one component, one breakpoint" instruction rather than two parallel
implementations that can drift.

**Currency formatting has exactly one implementation.** `lib/currency.ts`'s `formatCurrency`
wraps `Intl.NumberFormat` per design-handoff's table (EUR/USD 2 decimals, HUF 0), used by every
component that renders an amount — the balance in the switcher, transfer amounts, the
table/list. No component formats a number itself.

**Server error messages are shown verbatim, not re-mapped.** `ApiError.message` from the backend
(`GlobalExceptionHandler`, server README §8) is written for exactly this — insufficient balance,
FX unavailable, validation failures all already produce human-appropriate text server-side.
The client's job is to place that message correctly (inline under a field for `400`s in the form,
in the failed-flow detail block for `409`/`503`), not to reinterpret it.

**Design tokens are data, not scattered class names.** The Nocturne color/spacing/radius values
in `design-handoff/README.md` go into `styles.css` as Tailwind v4 `@theme` variables
(`--color-bg`, `--color-accent`, etc.) once, and every component references them via Tailwind
utility classes generated from those variables — not hard-coded hex values in component files.

---

## Compound flows: `TransferFlow` and `AccountSwitcher`

These are the two genuinely stateful, multi-step pieces of UI, and both follow the same shape
from `vercel-composition-patterns`: a `Provider` that is the *only* thing that knows how state is
managed, exposing a generic `{ state, actions, meta }` context interface; child components consume
that interface and know nothing about `useState` vs. a mutation vs. anything else underneath.

### `TransferFlow`

Replaces the earlier "one component with an internal `step` switch" description with the
compound-component shape — same behavior, but the steps are now real sibling components instead
of branches inside one file:

```tsx
interface TransferFlowState {
  step: 'form' | 'pending' | 'success' | 'failed'
  sourceAccount: Account
  result?: Transfer          // set on success
  error?: ApiError           // set on failure
}

interface TransferFlowActions {
  submit: (values: TransferFormValues) => void   // first attempt
  retry: () => void                              // re-mutate with the SAME idempotency key
  editAmount: () => void                          // back to 'form', but mints a NEW key (see below)
  reset: () => void                               // modal closed — next open starts fresh
}

interface TransferFlowMeta {
  idempotencyKey: string
}

const TransferFlowContext = createContext<
  { state: TransferFlowState; actions: TransferFlowActions; meta: TransferFlowMeta } | null
>(null)
```

`TransferFlowProvider` owns the `step` state, generates the idempotency key once per attempt (a
`useState(() => crypto.randomUUID())` initializer — lazy init so it isn't regenerated every
render, `rerender-lazy-state-init`), and wraps `useCreateTransfer`. `retry()` calls `mutate()`
again with the *same* key already in state; `editAmount()`/`reset()` are the only two actions that
mint a fresh one. This is the exact mechanism `DECISION-LOG.md` #6 requires, now expressed as an
explicit action on the interface rather than something the caller has to get right by convention.

Usage composes exactly like the design-handoff's four states, but now each step is a real,
independently readable component:

```tsx
<TransferFlow.Provider sourceAccount={selectedAccount}>
  <Modal.Root open={transferOpen} onOpenChange={setTransferOpen}>
    <TransferFlow.Form />
    <TransferFlow.Pending />
    <TransferFlow.Success />
    <TransferFlow.Failed />
  </Modal.Root>
</TransferFlow.Provider>
```

Each of `Form`/`Pending`/`Success`/`Failed` reads `state.step` from context and renders `null` if
it isn't the active step — so the compound structure stays flat and declarative rather than one
component doing the switching. (These four components are defined once, at module scope, in their
own files — never inside `TransferFlowProvider`'s render, which would remount all of them on every
provider re-render, `rerender-no-inline-components`.)

**`TransferFlow.Failed` is one component, not two, and that's not a boolean-prop violation.** It
branches its copy/icon on `state.error.status` (`409` vs `503`). The "avoid boolean props, prefer
explicit variants" rule is about *caller-facing API surface* — a component whose behavior a
consumer picks with an ambiguous flag. Here nothing external chooses a mode; the component is
reading already-resolved domain data (which real HTTP status the server returned) off its own
context, the same way it reads `state.result` in `Success`. If a third failure shape ever needed
fundamentally different *structure* (not just copy), that would be the trigger to split it into
explicit siblings (`TransferFlow.FailedBalance`, `TransferFlow.FailedFxUnavailable`) — not before.

### `AccountSwitcher`

Same shape, smaller state:

```tsx
interface AccountSwitcherState {
  accounts: Account[]           // from useAccounts(), passed through
  selectedId: string
  isSwitching: boolean          // true between "row tapped" and the refetch resolving (design-handoff 2d)
}

interface AccountSwitcherActions {
  select: (id: string) => void
  openNewAccount: () => void
}
```

`AccountSwitcherProvider` wraps `useAccounts()` + `useSelectedAccount()`; `select()` sets the
optimistic `selectedId` immediately, wraps the id change in `startTransition` so the rest of the
page (the transactions list refetching underneath) doesn't block the switcher panel's own closing
animation (`rerender-transitions`), and derives `isSwitching` from the `['transfers', selectedId]`
query's `isFetching` flag rather than tracking a separate boolean by hand
(`rerender-derived-state-no-effect` — one more state variable that could drift otherwise).
`AccountSwitcherTrigger` and `AccountSwitcherPanel` (the row list + search + "New account") both
consume the same context, so the trigger's collapsed summary and the panel's expanded list are
never able to disagree about which account is selected.

---

## UI primitives library

Base primitives live in `components/ui/`, alongside the shadcn-vended ones already there
(`npx shadcn@latest add <component>` continues to be how new ones are added). A few are custom
compositions on top of shadcn/Base UI rather than shadcn output directly — those are called out
below. All of them follow React 19's ref-as-prop convention (`function Button({ ref, ...props })`)
— no `forwardRef` anywhere in this codebase (`react19-no-forwardref`).

| Primitive | Built from | Shape | Design-handoff rule it exists to satisfy |
|---|---|---|---|
| `Button` | shadcn Button + CVA `variant` prop (`primary`, `secondary`, `ghost`) | Single component, one enum-like variant prop — not `isPrimary`/`isGhost` booleans | "Primary buttons are outlined, never filled" — the visual signature lives in the `primary` variant's class list, defined once |
| `Input` | shadcn Input | Plain; amount fields compose it with a currency-symbol span via flex, no dedicated "adornment" primitive needed for something this simple | 46px height, `--color-bg` fill inside a surface |
| `SegmentedControl` | Custom, Base UI `Tabs`/radio-group primitives underneath | Compound: `SegmentedControl.Root`, `SegmentedControl.Option` | The 3-up EUR/USD/HUF picker in the New Account modal |
| `Modal` | shadcn Dialog (Base UI) + `useMediaQuery` | Compound: `Modal.Root`, `Modal.Header`, `Modal.Body`, `Modal.Footer`. Below 768px, `Root` renders as a bottom sheet (full width, top-radius only); at/above, a centered dialog at 440px | "One shadcn Dialog/Popover pair driven by a media query, not two components" — the *one* primitive `AccountSwitcher`, `NewAccountModal`, and `TransferFlow` all build on |
| `Badge` | shadcn Badge + CVA `variant` prop matching `TransferStatus` directly (`completed`, `processing`, `failed`) | One enum prop, no per-status boolean | The three status pill styles |
| `Card` | shadcn Card | Plain | Transaction row surface on phone, empty-state container |
| `Skeleton` | Custom (shimmer keyframes from design-handoff) | Plain, `width`/`height` props | Loading-state shimmer bars |
| `StatusIcon` | Custom, Lucide icons in a colored disc | One `status: TransferStatus \| 'pending'` prop selecting icon + colors | The 30px direction/status disc on each transaction row |

`EmptyState` (top-level `components/`, not `ui/`) is the one shared compound-ish component outside
`ui/`: `icon`, `title`, `description` props plus an `action` slot via `children` rather than a
`renderAction` prop (`patterns-children-over-render-props`) — used for both the no-accounts and
no-transactions states in design-handoff §6, which differ only in content, not structure.

**Heavy, not-needed-on-first-paint pieces are code-split.** `NewAccountModal` and `TransferFlow`
are loaded via `React.lazy` + `Suspense` (this is a Vite SPA, not Next.js, so it's `React.lazy`
rather than `next/dynamic` — same underlying idea as `bundle-dynamic-imports`: nothing outside the
initial page shell needs these until a user taps "New account" or "New transfer"). On a mobile-first
app, shipping two rarely-opened-on-first-visit modals in the critical bundle costs real time on a
phone's first paint for no benefit.

---

## Data flow

```
PageShell
  ├─ useSelectedAccount()            -> selectedAccountId (state + versioned localStorage)
  ├─ AccountSwitcher.Provider        -> AccountSwitcher.Trigger, AccountSwitcher.Panel
  ├─ useTransfers(selectedAccountId) -> TransactionList (<768px) | TransactionTable (>=768px)
  └─ "New transfer" button           -> opens TransferFlow.Provider(sourceAccount = selected)

TransferFlow (see "Compound flows" above)
  ├─ Form     -> actions.submit(values) on submit
  ├─ Pending  -> shown while the mutation is in flight
  ├─ Success  -> on 201; invalidates ['transfers', accountId] AND ['accounts']
  └─ Failed   -> on 409/503; "Try again" -> actions.retry() (same key)
```

The double invalidation on success (transfers *and* accounts) is deliberate and easy to miss:
the source account's balance just changed, so the switcher's cached balance would otherwise go
stale until an unrelated refetch happened to occur.

---

## What this doc doesn't cover

Component-internal implementation (exact JSX, exact Tailwind classes) — that's
`design-handoff/README.md`'s job, section by section, and shouldn't be duplicated here. This doc
is the layer *above* that: where things live and why, not what they render.
