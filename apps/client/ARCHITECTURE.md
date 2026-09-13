# Client architecture

High-level architecture for `apps/client`, derived from `design-handoff/README.md` (the UI spec)
and the tech stack already committed to in the root `README.md`/`DECISION-LOG.md`. Feature-sliced
folder structure, matching the convention used across other projects.

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
│   │   │   └── useSelectedAccount.ts selection state + localStorage persistence
│   │   ├── components/
│   │   │   ├── AccountSwitcher.tsx        trigger + breakpoint-aware Dialog/Sheet
│   │   │   ├── AccountSwitcherRow.tsx     one account row (phone/tablet/desktop share this)
│   │   │   └── NewAccountModal.tsx
│   │   ├── types.ts                  Account, CreateAccountRequest
│   │   └── index.ts                  public exports (only what other features import)
│   │
│   └── transfers/
│       ├── api/
│       │   └── transfers.api.ts      getTransfers(accountId?), createTransfer(body, idempotencyKey)
│       ├── hooks/
│       │   ├── useTransfers.ts       useQuery(['transfers', accountId])
│       │   └── useCreateTransfer.ts  useMutation; owns the idempotency-key lifecycle (see below)
│       ├── components/
│       │   ├── TransactionList.tsx        phone card list
│       │   ├── TransactionTable.tsx       ≥768px table
│       │   ├── TransactionRow.tsx         shared row-data presentation (icon, copy, amount sign)
│       │   ├── StatusBadge.tsx
│       │   └── TransferModal/
│       │       ├── TransferModal.tsx      owns the step state machine (form/pending/success/failed)
│       │       ├── TransferForm.tsx
│       │       ├── TransferPending.tsx
│       │       ├── TransferSuccess.tsx
│       │       └── TransferFailed.tsx     handles both 409 and 503 bodies (see Components below)
│       ├── types.ts                  Transfer, CreateTransferRequest, TransferStatus
│       └── index.ts
│
├── components/
│   ├── ui/                           shadcn primitives (dialog, button, input, select, ...)
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
| Selected account id | `useSelectedAccount` (React state + `localStorage`) | Page-level context, not server data; survives a reload per design-handoff's "Interactions" section |
| Modal open/closed (`switcherOpen`, `transferOpen`, `newAccountOpen`) | Local `useState` in whichever component owns that modal | Pure UI state, no reason to lift it — nothing outside that modal reads it |
| The transfer attempt's idempotency key | `useCreateTransfer`'s caller (see below) | Must outlive individual `mutate()` calls (retries reuse it), so it can't live *inside* the mutation itself |

No global client-state library (Redux, Zustand, etc.) — matches the already-documented decision
that most of this app's state is server state (root `README.md`, "Frontend stack" decisions).

**Idempotency key lifecycle — the one piece of state that's easy to get wrong.** The key is
generated once when the transfer modal is opened fresh (`crypto.randomUUID()`), held in a
`useRef`/`useState` at the `TransferModal` level (*above* the mutation hook), and passed into
every `mutate()` call for that modal's lifetime — including the "Try again" retries on the `409`/
`503` screens. `useCreateTransfer` itself takes the key as a parameter rather than generating one
internally, specifically so it can never accidentally mint a fresh key on retry. A new key is
only created when the modal is closed and reopened, or when the user edits the form after a
failure ("Edit amount" — design-handoff `1f`). This is the client half of `DECISION-LOG.md` #6;
getting it wrong (e.g. generating the key inside the mutation function) would silently defeat the
server's idempotency guarantee on every retry.

**One API client function per write, and only one.** `createTransfer(body, idempotencyKey)` in
`transfers.api.ts` is the *only* place `POST /api/transfers` is called from — design-handoff is
explicit that this is what makes a missing header structurally impossible, not just
convention. `lib/api-client.ts` holds the shared axios instance (base URL, JSON headers) and an
interceptor that normalizes every error response into the `ApiError` shape (`types/api.ts`) so
calling code never touches Axios's own error wrapper.

**One breakpoint hook, not scattered `md:` classes, for structural swaps.** `useMediaQuery(
'(min-width: 768px)')` is the single source of truth for: AccountSwitcher's bottom-sheet vs.
popover presentation, and TransactionList vs. TransactionTable. Tailwind responsive classes still
handle *styling* differences (padding, font size per the design-handoff's phone/tablet/desktop
tables) — but which *component* renders is a JS decision in one place, matching design-handoff's
explicit "one component, one breakpoint" instruction rather than two parallel implementations
that can drift.

**The transfer modal is one component with an internal state machine, not four modals.**
`TransferModal` owns a `step: 'form' | 'pending' | 'success' | 'failed'` and renders the matching
child, keeping the header/from-account context visually constant across steps — exactly the "one
sheet, one act" framing in design-handoff §5. `TransferFailed` handles both `409` and `503` bodies
(different copy/icon, same shape: message, detail block, retry action) rather than being two
components, since the only difference is presentational.

**Currency formatting has exactly one implementation.** `lib/currency.ts`'s `formatCurrency`
wraps `Intl.NumberFormat` per design-handoff's table (EUR/USD 2 decimals, HUF 0), used by every
component that renders an amount — the balance in the switcher, transfer amounts, the
table/list. No component formats a number itself.

**Server error messages are shown verbatim, not re-mapped.** `ApiError.message` from the backend
(`GlobalExceptionHandler`, server README §8) is written for exactly this — insufficient balance,
FX unavailable, validation failures all already produce human-appropriate text server-side.
The client's job is to place that message correctly (inline under a field for `400`s in the form,
in the failed-state detail block for `409`/`503`), not to reinterpret it.

**Design tokens are data, not scattered class names.** The Nocturne color/spacing/radius values
in `design-handoff/README.md` go into `styles.css` as Tailwind v4 `@theme` variables
(`--color-bg`, `--color-accent`, etc.) once, and every component references them via Tailwind
utility classes generated from those variables — not hard-coded hex values in component files.

---

## Data flow

```
PageShell
  ├─ useSelectedAccount()           -> selectedAccountId (state + localStorage)
  ├─ useAccounts()                  -> AccountSwitcher (list, balance, currency)
  ├─ useTransfers(selectedAccountId) -> TransactionList (<768px) | TransactionTable (>=768px)
  └─ "New transfer" button          -> opens TransferModal(sourceAccountId = selectedAccountId)

TransferModal
  ├─ TransferForm       -> useCreateTransfer().mutate(body, key) on submit
  ├─ TransferPending    -> shown while the mutation is in flight
  ├─ TransferSuccess    -> on 201; invalidates ['transfers', accountId] AND ['accounts']
  └─ TransferFailed     -> on 409/503; "Try again" re-calls mutate() with the SAME key
```

The double invalidation on success (transfers *and* accounts) is deliberate and easy to miss:
the source account's balance just changed, so the switcher's cached balance would otherwise go
stale until an unrelated refetch happened to occur.

---

## What this doc doesn't cover

Component-internal implementation (exact JSX, exact Tailwind classes) — that's
`design-handoff/README.md`'s job, section by section, and shouldn't be duplicated here. This doc
is the layer *above* that: where things live and why, not what they render.
