# API flow diagrams

UML diagrams for the implemented endpoints — a class diagram for the domain model, a component
view of how the beans fit together, and a sequence diagram per endpoint. These render natively
on GitHub; no external tooling needed. Cross-referenced from `README.md` §3 (API contract).

---

## Domain model

```mermaid
classDiagram
    class Currency {
        <<enumeration>>
        EUR
        USD
        HUF
    }

    class TransferStatus {
        <<enumeration>>
        PROCESSING
        COMPLETED
        FAILED
    }

    class Account {
        -UUID id
        -String ownerName
        -Currency currency
        -BigDecimal balance
        -Long version
        +debit(amount) void
        +credit(amount) void
    }

    class Transfer {
        -UUID id
        -String idempotencyKey
        -UUID fromAccountId
        -UUID toAccountId
        -BigDecimal amount
        -Currency sourceCurrency
        -Currency targetCurrency
        -BigDecimal exchangeRate
        -TransferStatus status
        -Instant notifiedAt
        -Instant createdAt
        +markCompleted(rate) void
        +markFailed() void
        +markNotified() void
    }

    Account "1" --> "1" Currency : currency
    Transfer "1" --> "1" TransferStatus : status
    Transfer "1" --> "2" Currency : source / target
    Transfer ..> Account : fromAccountId / toAccountId\n(raw UUID FK, not a JPA @ManyToOne —\nqueries never need to load the account graph)
```

`Transfer` doubles as both the idempotency record and the outbox row (`idempotencyKey` +
`status`, `notifiedAt`) rather than three separate tables — see `DECISION-LOG.md` #7.

---

## Component view

How the beans collaborate. `TransferPersistence` is deliberately a separate bean from
`TransferService` — see its class-level javadoc for why (Spring's self-invocation limitation on
`@Transactional`).

```mermaid
flowchart TB
    subgraph HTTP layer
        AC[AccountController]
        TC[TransferController]
        GEH[GlobalExceptionHandler]
    end

    subgraph Orchestration
        AS[AccountService]
        TS[TransferService]
        TP["TransferPersistence\n(REQUIRES_NEW transactional steps)"]
    end

    subgraph Persistence
        AR[(AccountRepository)]
        TR[(TransferRepository)]
    end

    subgraph FX port/adapter
        ERC{{ExchangeRateClient}}
        MERC[MockExchangeRateClient]
    end

    subgraph Outbox port/adapter
        TEP["TransferEventPublisher\n(@Scheduled)"]
        TN{{TransferNotifier}}
        LTN[LoggingTransferNotifier]
    end

    AC --> AS --> AR
    TC --> TS
    TS --> AR
    TS --> TP
    TS --> ERC
    TP --> AR
    TP --> TR
    MERC -.implements.-> ERC
    TEP --> TR
    TEP --> TN
    LTN -.implements.-> TN
    GEH -.maps exceptions from.-> TS
    GEH -.maps exceptions from.-> TP
```

---

## `POST /api/accounts`

```mermaid
sequenceDiagram
    actor Client
    participant AC as AccountController
    participant AS as AccountService
    participant AR as AccountRepository
    participant DB as Postgres

    Client->>AC: POST /api/accounts {ownerName, currency, initialBalance}
    AC->>AC: @Valid bean validation (400 on failure)
    AC->>AS: createAccount(request)
    AS->>AS: new Account(ownerName, currency, initialBalance)
    AS->>AR: save(account)
    AR->>DB: INSERT INTO account ...
    DB-->>AR: generated id
    AR-->>AS: Account
    AS-->>AC: Account
    AC-->>Client: 201 Created + AccountResponse
```

## `GET /api/accounts` & `GET /api/accounts/{id}`

```mermaid
sequenceDiagram
    actor Client
    participant AC as AccountController
    participant AS as AccountService
    participant AR as AccountRepository

    rect rgb(240,240,255)
    Note over Client,AR: GET /api/accounts
    Client->>AC: GET /api/accounts
    AC->>AS: listAccounts()
    AS->>AR: findAll()
    AR-->>AS: List~Account~
    AS-->>AC: List~Account~
    AC-->>Client: 200 OK + [AccountResponse]
    end

    rect rgb(255,245,235)
    Note over Client,AR: GET /api/accounts/{id}
    Client->>AC: GET /api/accounts/{id}
    AC->>AS: getAccount(id)
    AS->>AR: getOrThrow(id)
    alt found
        AR-->>AS: Account
        AS-->>AC: Account
        AC-->>Client: 200 OK + AccountResponse
    else not found
        AR-->>AS: throw AccountNotFoundException
        Note over AC: caught by GlobalExceptionHandler
        AC-->>Client: 404 Not Found + ApiError
    end
    end
```

## `POST /api/transfers`

The real complexity lives here: idempotency claim/reclaim, FX resolution, and the
optimistic-lock retry loop, exactly as implemented (not simplified) — server README §4/§5/§6.

```mermaid
sequenceDiagram
    actor Client
    participant TC as TransferController
    participant TS as TransferService
    participant AR as AccountRepository
    participant TP as TransferPersistence
    participant TR as TransferRepository
    participant FX as ExchangeRateClient

    Client->>TC: POST /api/transfers\nheader X-Idempotency-Key\n{fromAccountId, toAccountId, amount, currency}
    TC->>TC: @Valid + required header (400 if missing)
    TC->>TS: createTransfer(request, idempotencyKey)

    TS->>TS: fromAccountId != toAccountId? (else InvalidTransferException -> 400)
    TS->>AR: getOrThrow(fromAccountId)
    TS->>AR: getOrThrow(toAccountId)
    TS->>TS: currency == fromAccount.currency? (else InvalidTransferException -> 400)

    TS->>TP: attemptClaim(Transfer[PROCESSING])
    TP->>TR: saveAndFlush(candidate)

    alt idempotency_key unique-constraint conflict
        TR-->>TP: DataIntegrityViolationException
        TP-->>TS: DataIntegrityViolationException
        TS->>TP: reclaim(idempotencyKey)
        TP->>TR: findByIdempotencyKey(key)
        TR-->>TP: existing Transfer

        alt existing.status == PROCESSING
            TP-->>TS: throw IdempotencyConflictException
            TC-->>Client: 409 Conflict
        else existing.status == COMPLETED
            TP-->>TS: existing (safe replay)
            TC-->>Client: 201 Created (original result replayed)
        else existing.status == FAILED
            TP->>TR: reclaimFailed(id)  Note: guarded CAS, WHERE status='FAILED'
            alt 0 rows affected (lost the race)
                TP-->>TS: throw IdempotencyConflictException
                TC-->>Client: 409 Conflict
            else claimed
                TP-->>TS: reclaimed Transfer, now PROCESSING
            end
        end
    else insert succeeded
        TR-->>TP: saved Transfer [PROCESSING]
        TP-->>TS: candidate
    end

    Note over TS: only reached once this call owns a PROCESSING row
    alt fromAccount.currency != toAccount.currency
        TS->>FX: getRate(from, to)
        Note right of FX: @Retry / @CircuitBreaker / @TimeLimiter
        alt resolved
            FX-->>TS: CompletableFuture completes with rate
        else exhausted
            FX-->>TS: completes exceptionally: ExchangeRateUnavailableException
            TS->>TP: markFailed(transferId)
            TC-->>Client: 503 Service Unavailable
        end
    else same currency
        Note over TS: rate = null, nothing to resolve
    end

    loop up to 3 attempts, 25ms backoff
        TS->>TP: executeAndComplete(transferId, fromId, toId, amount, rate)
        TP->>AR: getOrThrow(fromAccountId)
        TP->>AR: getOrThrow(toAccountId)
        alt insufficient balance
            TP-->>TS: throw InsufficientBalanceException
            TS->>TP: markFailed(transferId)
            TC-->>Client: 409 Conflict
        else sufficient balance
            TP->>TP: fromAccount.debit(amount)\ntoAccount.credit(amount * rate)
            TP->>TR: transfer.markCompleted(rate)
            alt ObjectOptimisticLockingFailureException
                Note over TS: retry (account.version conflict from a\ndifferent idempotency key on the same account)
            else success
                TP-->>TS: Transfer [COMPLETED]
            end
        end
    end
    opt all retries exhausted
        TS->>TP: markFailed(transferId)
        TC-->>Client: 409 Conflict
    end

    TS-->>TC: Transfer [COMPLETED]
    TC-->>Client: 201 Created + TransferResponse
```

## `GET /api/transfers` & `GET /api/transfers/{id}`

```mermaid
sequenceDiagram
    actor Client
    participant TC as TransferController
    participant TS as TransferService
    participant TR as TransferRepository

    rect rgb(240,240,255)
    Note over Client,TR: GET /api/transfers?accountId= (optional filter)
    Client->>TC: GET /api/transfers?accountId=...
    TC->>TS: listTransfers(accountId)
    alt accountId provided
        TS->>TR: findInvolvingAccount(accountId)
    else no filter
        TS->>TR: findAll()
    end
    TR-->>TS: List~Transfer~ (every status, FAILED included)
    TS-->>TC: List~Transfer~
    TC-->>Client: 200 OK + [TransferResponse]
    end

    rect rgb(255,245,235)
    Note over Client,TR: GET /api/transfers/{id}
    Client->>TC: GET /api/transfers/{id}
    TC->>TS: getTransfer(id)
    TS->>TR: findById(id)
    alt found
        TR-->>TS: Transfer
        TS-->>TC: Transfer
        TC-->>Client: 200 OK + TransferResponse
    else not found
        TR-->>TS: empty
        TS-->>TC: throw TransferNotFoundException
        TC-->>Client: 404 Not Found + ApiError
    end
    end
```

## Bonus: the outbox publisher (not an HTTP endpoint, but completes the system-integration requirement)

```mermaid
sequenceDiagram
    participant Scheduler as @Scheduled (fixedDelay=1000)
    participant TEP as TransferEventPublisher
    participant TR as TransferRepository
    participant TN as TransferNotifier
    participant Log as LoggingTransferNotifier

    Scheduler->>TEP: publishPendingEvents()
    TEP->>TR: findByStatusAndNotifiedAtIsNull(COMPLETED)
    TR-->>TEP: List~Transfer~
    loop for each pending transfer
        TEP->>TN: notify(TransferCompletedEvent)
        TN->>Log: log.info("TRANSFER_COMPLETED ...")
        alt delivery succeeds
            TEP->>TEP: transfer.markNotified()
            TEP->>TR: save(transfer)
        else notifier throws
            Note over TEP: leave notified_at null —\nretried on the next poll,\ndoesn't block other transfers in this poll
        end
    end
```
