package com.globalpayment.server.transfer;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountNotFoundException;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.transfer.dto.TransferRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;

/**
 * Deliberately not {@code @Transactional} — this is a plain orchestrator over
 * {@link TransferPersistence}'s three separately-transactional steps (server README §4). FX/
 * cross-currency transfers aren't implemented yet (root README TODO).
 */
@Service
public class TransferService {

    /** Bounded retry on account-version conflicts (server README §5) — 2-3 attempts total. */
    private static final int MAX_OPTIMISTIC_LOCK_ATTEMPTS = 3;

    private static final long OPTIMISTIC_LOCK_BACKOFF_MILLIS = 25;

    private final AccountRepository accountRepository;
    private final TransferRepository transferRepository;
    private final TransferPersistence transferPersistence;

    public TransferService(
            AccountRepository accountRepository,
            TransferRepository transferRepository,
            TransferPersistence transferPersistence) {
        this.accountRepository = accountRepository;
        this.transferRepository = transferRepository;
        this.transferPersistence = transferPersistence;
    }

    public Transfer createTransfer(TransferRequest request, String idempotencyKey) {
        if (request.fromAccountId().equals(request.toAccountId())) {
            throw new InvalidTransferException("fromAccountId and toAccountId must differ");
        }

        Account fromAccount = accountRepository
                .findById(request.fromAccountId())
                .orElseThrow(() -> new AccountNotFoundException(request.fromAccountId()));
        Account toAccount = accountRepository
                .findById(request.toAccountId())
                .orElseThrow(() -> new AccountNotFoundException(request.toAccountId()));

        if (request.currency() != fromAccount.getCurrency()) {
            throw new InvalidTransferException(
                    "currency must match the source account's currency (" + fromAccount.getCurrency() + ")");
        }
        if (fromAccount.getCurrency() != toAccount.getCurrency()) {
            // FX resolution isn't implemented yet (root README TODO) — only same-currency
            // transfers are supported until it lands.
            throw new InvalidTransferException("cross-currency transfers are not yet supported");
        }

        Transfer candidate = new Transfer(
                idempotencyKey,
                fromAccount.getId(),
                toAccount.getId(),
                request.amount(),
                fromAccount.getCurrency(),
                toAccount.getCurrency(),
                null,
                TransferStatus.PROCESSING);

        Transfer owned;
        try {
            owned = transferPersistence.attemptClaim(candidate);
        } catch (DataIntegrityViolationException conflict) {
            Transfer reclaimed = transferPersistence.reclaim(idempotencyKey);
            if (reclaimed.getStatus() == TransferStatus.COMPLETED) {
                return reclaimed; // safe replay — the row IS the response
            }
            owned = reclaimed; // FAILED -> PROCESSING; this call now owns the retry
        }

        try {
            return executeWithOptimisticLockRetry(owned);
        } catch (RuntimeException failure) {
            transferPersistence.markFailed(owned.getId());
            throw failure;
        }
    }

    /**
     * Retries only {@link ObjectOptimisticLockingFailureException} — a version conflict on one of
     * the two accounts from a *different* idempotency key touching the same account concurrently
     * (server README §5). Each attempt calls {@link TransferPersistence#executeAndComplete}
     * fresh, so both the account reads and the balance check are never stale. Any other exception
     * (e.g. insufficient balance) propagates immediately — retrying wouldn't change the outcome.
     */
    private Transfer executeWithOptimisticLockRetry(Transfer owned) {
        for (int attempt = 1; ; attempt++) {
            try {
                return transferPersistence.executeAndComplete(
                        owned.getId(), owned.getFromAccountId(), owned.getToAccountId(), owned.getAmount());
            } catch (ObjectOptimisticLockingFailureException conflict) {
                if (attempt >= MAX_OPTIMISTIC_LOCK_ATTEMPTS) {
                    throw conflict;
                }
                sleepBriefly();
            }
        }
    }

    private void sleepBriefly() {
        try {
            Thread.sleep(OPTIMISTIC_LOCK_BACKOFF_MILLIS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while backing off an optimistic-lock retry", interrupted);
        }
    }

    /** Every status is included (server README §3) — a FAILED row is a real, queryable attempt. */
    public List<Transfer> listTransfers(UUID accountId) {
        if (accountId == null) {
            return transferRepository.findAll();
        }
        return transferRepository.findInvolvingAccount(accountId);
    }

    public Transfer getTransfer(UUID id) {
        return transferRepository.findById(id).orElseThrow(() -> new TransferNotFoundException(id));
    }
}
