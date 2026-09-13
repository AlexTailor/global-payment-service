# Handoff: Global Payment Service — client UI

## Overview

The React frontend for `apps/client` in the `AlexTailor/global-payment-service` Nx monorepo: a
single-page app over the existing Spring Boot API at `:8080`. One page — a header with an account
switcher, the selected account's balance, its transaction list, and every create action in a
modal over that page. No routing, no full navigations.

Three required capabilities map onto the structure like this:

| Capability | Where it lives |
|---|---|
| View / create accounts | The header switcher (list) + its "New account" item (creation modal) |
| Transfer | "New transfer" modal: destination, amount, result inline before it closes |
| Transactions | The list under the header, scoped to the selected account |

## About the design files

`Global Payment Service - Mockups.dc.html` is a **design reference written in HTML** — a static
board of 22 states, not production code and not a component library. Nothing in it should be
copied into the app verbatim.

The task is to **recreate these screens in `apps/client`** using the stack that repo has already
committed to: React 19 + TypeScript, Vite, TanStack Query + axios, react-hook-form + zod,
shadcn/ui on Base UI, Tailwind CSS v4 (Nova preset), Lucide icons, Geist font. Components go in
`apps/client/src/components/ui` via `npx shadcn@latest add <component>`; `@/*` resolves to
`apps/client/src/*`.

Two substitutions to make while translating:

- **Icons**: the mockups draw Phosphor SVG paths inline because that is the design system's icon
  set. Use **Lucide** in the app — it's already the repo's choice. Equivalents: `ChevronDown`,
  `Check`, `ArrowUpRight`, `ArrowDownLeft`, `Loader2`, `X`, `AlertCircle`, `RotateCw`, `Plus`,
  `Search`, `Delete`, `Wallet`.
- **Font**: the mockups use Inter (the design system's face). The repo specifies **Geist**. Keep
  Geist and hold the same weights (500 headings, 400 body).

Everything else — colors, spacing, radii, hierarchy, copy — should come across as-is.

## Fidelity

**High fidelity.** Final colors, type sizes, spacing, copy and states. Recreate the UI closely,
expressed through Tailwind v4 theme variables rather than ad-hoc classes.

## Opening the reference

Open `Global Payment Service - Mockups.dc.html` in a browser (it needs no build step; `support.js`
and `_ds/` sit beside it). It is a pan/zoom board of two turns:

- **Turn 2** (top) — the account switcher at every width: `2a` phone sheet, `2b` tablet popover,
  `2c` desktop popover with search, `2d` the switching/refetch state.
- **Turn 1** — everything else: `1a`–`1g` the core flow, `1h`–`1l` creation, empty and loading
  states, `1m`–`1n` tablet and desktop, `1o`–`1r` variations.

Each frame carries a caption with the API/behavioural note for that state.

---

## Design tokens

Taken from the Nocturne design system (`_ds/nocturne-.../styles.css`, included in this bundle).
Map these into `apps/client/src/styles.css` as Tailwind v4 `@theme` variables.

### Color

| Token | Hex | Used for |
|---|---|---|
| `--color-bg` | `#161826` | Page ground, inputs inside surfaces |
| `--color-surface` | `#232532` | Cards, sheets, popovers, header switcher trigger |
| `--color-text` | `#e9e9ed` | Body text |
| `--color-accent` | `#9184d9` | Outlines, focus ring, active marks |
| `--color-accent-100` | `#f5f4ff` | Text on accent-800 tints |
| `--color-accent-300` | `#d2cefd` | Accent-coloured **text** at paragraph size |
| `--color-accent-400` | `#b5abfc` | Spinners, pressed accent on dark |
| `--color-accent-800` | `#423a6a` | "Completed" badge fill |
| `--color-neutral-300` | `#cfd3e5` | Secondary body text |
| `--color-neutral-400` | `#b2b6ca` | Field labels |
| `--color-neutral-500` | `#9397ab` | Muted labels, currency symbols |
| `--color-neutral-600` | `#75798c` | Timestamps, hints, placeholder |
| `--color-neutral-700` | `#595d6c` | Sheet grabber, inert radio outlines |
| `--color-neutral-800` | `#3f424d` | Skeleton bars |
| `--color-neutral-900` | `#292b31` | Icon discs, modal backdrop base |
| `--color-divider` | `rgb(233 233 237 / .16)` | Borders, rules |

**Failure red — added outside the system**, held at the accent's own lightness and chroma
(oklch 0.66 / 0.125, hue 25) so it sits in the same family:

- `#b0645f` — borders and dots on FAILED
- `#e0a5a1` — FAILED text and icons (contrast-safe on `--color-bg`)

The design system is otherwise mono: there is no second accent, and no green. Success is carried
by the accent, not by green.

Backdrop: `color-mix(in srgb, var(--color-neutral-900) 62%, transparent)` on phone,
40% on tablet, 35% on desktop.

### Type

Geist (repo) at the sizes the mockups use, weight 500 for headings, 400 for body.
Headings: `line-height: 1.12`, `letter-spacing: -0.015em` (−0.02em at 22px and above).

| Role | Size |
|---|---|
| Balance, hero amount | 26px / 46px on the keypad variant |
| Sheet & dialog title | 20–22px |
| Section title in sheet | 18px |
| Body, list rows, inputs | 13.5–14px |
| Labels, meta, captions | 11–12px |
| Badge text | 10px |
| Section eyebrows | 11px, `letter-spacing: .1em`, uppercase |

All amounts use `font-variant-numeric: tabular-nums`.

### Spacing, radius, elevation

- Radii: 8px everywhere; 14px on sheets, dialogs and popovers; 6px on badges.
- Page padding: 16px phone, 28px tablet, 40px desktop.
- List gap: 8px. Sheet field gap: 16px.
- Hit targets: 44px minimum, 46–48px on primary actions.
- Elevation: `--shadow-lg` = `0 0 0 1px #9397ab, 0 16px 40px rgb(0 0 0 / .65)` on sheets,
  dialogs and popovers. Nothing else is elevated.

### Two visual signatures to preserve

1. **Primary buttons are outlined, never filled** — 1px `--color-accent` border on transparent,
   accent text. Hover `color-mix(in srgb, var(--color-accent) 12%, transparent)`, active 22%.
   Secondary is the same shape with a `--color-divider` border and body text.
2. **Rules fade at their ends** over 48px:
   ```css
   background: linear-gradient(to right, transparent,
     var(--color-divider) 48px,
     var(--color-divider) calc(100% - 48px), transparent);
   ```
   Used on the header underline, the table's row rules, and the divider above "New account".
   Short in-control separators (inside a sheet, inside a popover) stay solid.

Focus is always `outline: 2px solid var(--color-accent); outline-offset: 2px` — never the
browser default.

---

## Currency formatting

Decide once, in one helper, and use it everywhere:

| Currency | Format | Example |
|---|---|---|
| EUR | `€` prefix, 2 decimals, comma thousands | `€4,182.60` |
| USD | `$` prefix, 2 decimals, comma thousands | `$1,940.00` |
| HUF | `Ft` suffix, **0 decimals**, space thousands | `1 620 000 Ft` |

`Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: currency === 'HUF' ? 0 : 2 })`
gets there; verify the HUF grouping character in the chosen locale.

Outgoing amounts are prefixed `−`, incoming `+`. A FAILED amount is struck through and drops to
`--color-neutral-500`.

---

## Screens

### 1. Page shell — `1a`

**Purpose**: see the selected account's balance and its transactions; launch everything else.

Layout, phone (390px):

1. Header, 10px/16px padding: product name at 15px/500. Nothing else.
2. Account switcher trigger — full width minus 32px margin, `--color-surface`,
   1px `--color-divider`, radius 8, min-height 64px, 12px/14px padding. Left column: owner +
   currency at 11px uppercase `letter-spacing:.06em` in `--color-neutral-500`; balance at 26px/500
   beneath. Right: a 16px chevron in `--color-accent`. Whole thing is the popover/sheet trigger.
3. Section header 22px above / 10px below: "Transactions" (11px uppercase eyebrow) on the left,
   `{n} · all statuses` in `--color-neutral-600` on the right.
4. The list (below).
5. Sticky footer: `New transfer`, `.btn-primary` full width, 46px, over a
   `linear-gradient(to top, var(--color-bg) 55%, transparent)` fade.

Tablet ≥768 (`1m`) and desktop (`1n`): the trigger moves into the header row, right-aligned
(min-height 44px, compact two-line label), "New transfer" becomes a header button, the list
becomes a table, and content caps at 1040px on desktop.

### 2. Transaction list — phone `1a`, table `1m`/`1n`

**Card row (phone)**: `--color-surface`, radius 8, 12px/14px padding, 12px gap.

- 30px circular disc, `--color-neutral-900` (`#2b1d1e` for FAILED), holding a 14px direction icon:
  `ArrowUpRight` out, `ArrowDownLeft` in, spinning `Loader2` in `--color-accent-400` while
  PROCESSING, `X` in `#e0a5a1` when FAILED.
- Middle: counterparty `{ownerName} · {currency}` at 14px; second line 11px
  `--color-neutral-600` — relative date + time, then the most useful extra fact for that row
  (original amount and rate on an inbound conversion, the failure reason on FAILED, "resolving
  rate" on PROCESSING, the short reference otherwise).
- Right, right-aligned: signed amount at 14px tabular, badge 5px below.

**Badges** (10px, `padding: 2px 8px`, radius 6):

| Status | Style |
|---|---|
| COMPLETED | fill `--color-accent-800`, text `--color-accent-100`, transparent border |
| PROCESSING | transparent fill, 1px `--color-accent` border, text `--color-accent-300` |
| FAILED | transparent fill, 1px `#b0645f` border, text `#e0a5a1` |

The badge is omitted on older completed rows (`1a`'s last row, at 55% opacity) — status is only
spelled out when it isn't the settled norm. Keep or drop that as you like; it is not load-bearing.

**Table (≥768px)** — columns Date · Counterparty · Reference · Amount (right) · Rate (right) ·
Status (right). Header cells 11px uppercase at 60% text opacity. Row rules are the fading
gradient, painted on the `<tr>` so the fade spans the row, not each cell. Hover adds a 4% text
tint over the rule. Reference is monospace 12px, truncated `8f2a19b4…c41` — 8 chars on desktop,
4 on tablet. Rate shows `—` when `exchangeRate` is null.

Never filter by status: PROCESSING, COMPLETED and FAILED all appear in date order.

### 3. Account switcher — `2a` phone, `2b` tablet, `2c` desktop, `1b` in page context

One shadcn Dialog/Popover pair driven by a media query, not two components.

**Phone (`2a`)**: bottom sheet, full width, radius 14 on the top corners only, 10px/16px padding,
22px bottom. 36×4px grabber centred. Title "Accounts" 18px/500, with `3 accounts · 2 currencies`
on the right at 11px. Rows are 64px buttons: owner 14px, `{CURRENCY} · ••{last4}` 11px
`--color-neutral-500`, balance 17px/500 tabular on the right. Selected row gets a
1px `--color-accent` border and a 16px `Check`; unselected rows get a `--color-divider` border and
a 7% text hover tint. Then the fading divider, then "New account" as `.btn-ghost`, left-aligned,
46px, with a 16px `Plus`.

**Tablet (`2b`)**: anchored popover, 340px, right-aligned to the trigger, 8px below it, radius 14,
12px padding, `--shadow-lg`. Backdrop dims the page 40% and is click-to-dismiss. Eyebrow
"Switch account" replaces the title. Rows drop to 44px, 10px padding, 13.5px owner, 15px balance;
selection is a 10% accent tint plus the accent border; unselected rows have a transparent border
so nothing shifts on select. The trigger's chevron rotates 180°, and the trigger border becomes
`--color-accent` while open.

**Desktop (`2c`)**: 380px, same rows plus two additions that only earn their place at this width —
a search field at the top (38px, `--color-bg` fill, `Search` icon, `⌘K` hint chip) and a
transaction count appended to each row's second line. Both are client-side over the already
fetched `GET /api/accounts`; no new endpoint.

**Switching (`2d`)**: selection is optimistic — the tapped row takes the selected treatment
immediately, its balance replaced by a 56×12px shimmering skeleton and a spinning `Loader2` while
`['accounts']` refetches. The panel stays open until the new context resolves, then closes.

### 4. New account modal — `1h`

Phone sheet / desktop dialog, same as the switcher's breakpoint rule. Fields:

- **Owner name** — text input, 46px, `--color-bg` fill inside the surface.
- **Currency** — a 3-up segmented control, full width, 1px `--color-divider` frame, 13px dividers
  between options; the selected option takes `inset 0 0 0 1px var(--color-accent)` and accent
  text. EUR / USD / HUF.
- **Opening balance** — 46px, currency symbol at 18px `--color-neutral-500` on the left, amount
  18px tabular. Hint below: "Zero or more."

Actions: `Create account` (primary, 48px, full width), `Cancel` (secondary, 44px).

`POST /api/accounts` → on 201, select the new account and close. On 400, surface `message` under
the offending field.

### 5. Transfer modal — `1c` → `1d` → `1e` / `1f` / `1g`

The centrepiece. One sheet whose body swaps between four states; the header amount and
from/to context stay constant so it reads as one act.

**Filling in (`1c`)**

- Title "New transfer" 20px, subtitle `From {owner} · {currency} · {balance}` 12px
  `--color-neutral-500`.
- **To account** — select, 46px, listing every account except the source (the server rejects a
  self-transfer with 400; don't offer it).
- **Amount** — the emphasised field: 54px, 1px `--color-accent` border, currency symbol and value
  both at 24px/500 tabular. Below it, 11px `--color-neutral-500`: *"Currency is EUR — the source
  account's own. Fixed, not chosen."* The currency is **read-only, derived from the source
  account** and sent as `currency` in the body.
- **Conversion preview** — only when source and destination currencies differ: a `--color-bg`
  block with `Converted at ~{rate} {TARGET}/{SOURCE}` and the converted amount, plus
  *"Indicative. The confirmed rate comes back with the transfer."*
- Actions: `Send {amount}` (primary, 48px), `Cancel` (secondary, 44px).

**Pending (`1d`)** — the backend can take ~2s on a slow FX resolve plus retries, so show real
progress rather than a bare spinner: a three-step checklist in a `--color-bg` block —
"Transfer accepted" (accent `Check`), "Resolving {SOURCE} → {TARGET} rate" (spinning `Loader2`,
accent-400), "Moving funds" (hollow 16px ring, `--color-neutral-600`). Caption: *"This can take a
couple of seconds. Don't close the app."* Both buttons disabled, primary reading "Sending…".

The "resolving rate" step is skipped when currencies match — go straight to "Moving funds".

**Success (`1e`)** — 44px accent-outlined circle with a `Check`, "Transfer completed" at 22px,
`{amount} sent to {destination}` beneath. Then a 4-row detail block with solid 1px dividers:
Credited (converted target amount) · Exchange rate (4 dp) · New balance · Reference (monospace).
Actions: `Done` (primary), `Send another` (ghost).

Show `exchangeRate` only when it is non-null; on a same-currency transfer drop the Credited and
Exchange rate rows.

**409 — insufficient balance (`1f`)** — red-outlined circle with `X`, "Transfer failed",
then the server's `message` in `#e0a5a1`, then the arithmetic in
`--color-neutral-500`: available vs. requested, and *"Nothing was moved."* A detail block carries
`FAILED · 409`, the reference, and the line that explains the retry contract:
*"Retrying reuses the same idempotency key — it reclaims this attempt rather than creating a
second one."* Actions: `Try again` (primary, with `RotateCw`) and `Edit amount` (secondary).

**503 — FX unavailable (`1g`)** — neutral-outlined circle with `AlertCircle` (this is an outage,
not a rejection), "Couldn't get a rate", *"The exchange rate service didn't answer in time. Your
money hasn't moved."* Detail block: `FAILED · 503`, attempt counter, *"Safe to retry — same key,
same transfer row."* Actions: `Retry now` and `Close — it stays in the list as Failed`.

409 and 503 are never dead ends. A generic 4xx/5xx falls back to the same shell with the server's
`message` and a single `Close`.

**Validation (`1i`)** — zod via `@hookform/resolvers`, mirroring the server's bean validation.
Errored fields take a 1px `#b0645f` border; the message sits 6px below at 11.5px in `#e0a5a1`
("Pick a destination account.", "Amount must be greater than 0."). Validate on blur, then on every
change once a field has errored. The submit button is disabled while the form is invalid. A 400
from the server is still surfaced — the schemas can drift.

### 6. Empty and loading states

**No accounts (`1j`)** — no switcher, no transfer action. Centred-left block: 48px outlined
circle with `Wallet`, "No accounts yet" at 24px/500, then *"Create one to hold a balance and start
sending money. You can add more currencies later."* at 13.5px `--color-neutral-400`, then
`Create your first account` (primary, 48px, auto width).

**No transactions (`1k`)** — header, trigger and footer action all stay; only the list area is
replaced, centred: "Nothing here yet" 18px, *"Transfers to and from this account will show up here,
including ones that fail."* 13px `--color-neutral-500`. Empty is not an error.

**Loading (`1l`)** — the balance renders from cached `['accounts']`; only the list skeletons.
Four rows, real card geometry, bars in `--color-neutral-800` / `--color-neutral-900`, each row
`animation: shimmer 1.6s ease-in-out infinite` with an 0.18s stagger, the fourth at 60% opacity.
`New transfer` disabled until accounts resolve.

```css
@keyframes shimmer { 0%,100% { opacity:.35 } 50% { opacity:.75 } }
```

### 7. Variations — pick one of each before building

- **`1o` grouped by day** — day eyebrows, no cards, amount-led rows on fading rules, status as a
  6px dot plus a word only when it isn't Completed. Denser and quieter than `1a`.
- **`1p` expandable rows** — two-line collapsed rows; rate, target amount and reference appear in
  an accent-bordered expansion.
- **`1q` two-step transfer** — a review step before send (step dots, from/to, "You send" /
  "They receive ≈"). One extra tap on every transfer, in exchange for a confirmation beat.
- **`1r` one-step keypad** — amount first at 46px with a custom numeric pad. Fewest taps; the
  native numeric keyboard is the simpler alternative unless decimal entry needs control.

`1a` and `1c` are the baseline. Build those unless you prefer a variation.

---

## Interactions & behaviour

- **Account selection** is the page's context. Changing it refetches `['transfers', accountId]`.
  Persist the selected id in `localStorage` so a reload lands where the user left off; fall back to
  the first account when the stored id is gone.
- **Modals** are Base UI-backed shadcn Dialogs. Below 768px they are bottom-anchored, full width,
  top-radius only; at and above 768px they are centred at 440px. One component, one breakpoint.
- **After a successful transfer**: invalidate `['transfers', selectedAccountId]` **and**
  `['accounts']` — the source balance in the switcher just changed.
- **Motion**: sheets slide up 220ms `cubic-bezier(.32,.72,0,1)`; dialogs fade + 2% scale 160ms;
  backdrops fade 160ms. Spinners 1.1s linear. Nothing else animates.
- **Responsive**: one breakpoint at 768px for the modal presentation and list→table swap;
  a second at 1024px for the desktop-only popover extras and the 1040px content cap.

## State

| State | Where | Notes |
|---|---|---|
| `selectedAccountId` | React state + `localStorage` | The page context |
| `['accounts']` | TanStack Query | `GET /api/accounts` |
| `['transfers', selectedAccountId]` | TanStack Query | `GET /api/transfers?accountId=` |
| transfer mutation | `useMutation` | Holds `idempotencyKey` for the whole attempt |
| `switcherOpen`, `transferOpen`, `newAccountOpen` | React state | Plain UI state |

### Idempotency — the part that matters

Mint `crypto.randomUUID()` **once, when the user submits the transfer form**, hold it in the
mutation's state, and send it as `X-Idempotency-Key`. Reuse that exact key for every retry of that
submission — the "Try again" button on `1f` and `1g`, and any automatic retry.

Mint a fresh key only when the user starts a genuinely new transfer: reopening the modal, or
changing the form after a failure ("Edit amount" on `1f`). Do not let TanStack Query's automatic
retry regenerate it.

This is the client half of the backend's contract (`DECISION-LOG.md` #6). Without it, the
insert-first-then-branch idempotency on the server is never exercised by a real retry.

Configure axios so a missing key can't happen: a single `createTransfer(body, key)` function is the
only place `POST /api/transfers` is called from.

## API

Base `:8080`. Error body on every 4xx/5xx is `{ code, message, timestamp }` — surface `message`.

```
GET  /api/accounts                    → AccountResponse[]
POST /api/accounts                    { ownerName, currency: EUR|USD|HUF, initialBalance >= 0 }
                                      → 201 { id, ownerName, currency, balance } | 400
GET  /api/transfers?accountId={uuid}  → TransferResponse[]  (accountId optional)
POST /api/transfers                   header X-Idempotency-Key: <uuid>  (missing → 400)
                                      { fromAccountId, toAccountId, amount > 0, currency }
                                      → 201 { id, fromAccountId, toAccountId, amount,
                                              sourceCurrency, targetCurrency,
                                              exchangeRate: number|null, status, createdAt }
                                      → 400 | 404 | 409 (retryable) | 503 (retryable)
```

`currency` must equal the source account's own currency. The destination may differ — that is what
triggers FX server-side; nothing extra to send.

Full sequence diagrams: `apps/server/API-FLOWS.md`. Reasoning: `README.md`, `DECISION-LOG.md`.

## Assets

None. Every mark in the mockups is an inline SVG path (Phosphor) or a CSS shape — replace with
Lucide as listed above. No images, no logos.

## Files in this bundle

| File | What it is |
|---|---|
| `Global Payment Service - Mockups.dc.html` | The design board. Open in a browser. |
| `support.js` | Runtime the board needs to render. Not app code. |
| `_ds/nocturne-.../styles.css` | The design system's token sheet — the source of every value in the table above. |
| `_ds/nocturne-.../_ds_bundle.js` | Design system bundle the board loads. Not app code. |

Nothing in this bundle belongs in `apps/client`. Read the values out; write the components in the
repo's own stack.
