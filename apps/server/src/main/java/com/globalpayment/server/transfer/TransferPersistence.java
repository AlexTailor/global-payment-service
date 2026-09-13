package com.globalpayment.server.transfer;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountNotFoundException;
import com.globalpayment.server.account.AccountRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The transactional primitives behind the idempotency algorithm (server README §4), each its own
 * {@code REQUIRES_NEW} boundary. This has to be a separate bean from {@link TransferService}:
 * TransferService calling these as self-invoked methods on itself would silently bypass Spring's
 * transactional proxy (self-invocation never goes through the AOP interceptor), so none of the
 * {@code @Transactional} annotations would actually do anything.
 *
 * <p>{@link #attemptClaim} and {@link #reclaim} are deliberately two separate transactions rather
 * than one that catches its own unique-constraint violation and reads back within the same
 * transaction: on real Postgres, a failed statement aborts the whole transaction — any later
 * statement in it, even a plain {@code SELECT}, fails too, until it's rolled back. H2 is more
 * forgiving about this, which is exactly the kind of divergence worth not leaning on.
 */
@Component
public class TransferPersistence {

    private final TransferRepository transferRepository;
    private final AccountRepository accountRepository;

    public TransferPersistence(TransferRepository transferRepository, AccountRepository accountRepository) {
        this.transferRepository = transferRepository;
        this.accountRepository = accountRepository;
    }

    /**
     * Tries to insert a fresh PROCESSING row. Lets a unique-constraint violation propagate
     * uncaught so this transaction rolls back cleanly — the caller reacts to the exception in a
     * separate call/transaction (see {@link #reclaim}), never inside this one.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Transfer attemptClaim(Transfer candidate) {
        return transferRepository.saveAndFlush(candidate);
    }

    /**
     * Called only after {@link #attemptClaim} hit the unique constraint on {@code idempotencyKey}.
     * Reads the existing row fresh (own transaction, unaffected by the prior one's rollback) and
     * branches on its status.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Transfer reclaim(String idempotencyKey) {
        Transfer existing = transferRepository
                .findByIdempotencyKey(idempotencyKey)
                .orElseThrow(() -> new IllegalStateException(
                        "idempotency key vanished between insert conflict and read-back: " + idempotencyKey));

        return switch (existing.getStatus()) {
            case PROCESSING -> throw new IdempotencyConflictException(idempotencyKey);
            case COMPLETED -> existing;
            case FAILED -> {
                int rows = transferRepository.reclaimFailed(existing.getId());
                if (rows == 0) {
                    // another concurrent retry already claimed this row
                    throw new IdempotencyConflictException(idempotencyKey);
                }
                yield transferRepository.findById(existing.getId()).orElseThrow();
            }
        };
    }

    /**
     * Re-reads both accounts fresh (never the caller's earlier references) so the balance check
     * is never stale, debits/credits them, and marks the transfer COMPLETED — all one transaction,
     * so a failure here (e.g. insufficient balance) rolls back the balance change too and never
     * touches the transfer row at all.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Transfer executeAndComplete(UUID transferId, UUID fromAccountId, UUID toAccountId, BigDecimal amount) {
        Account fromAccount =
                accountRepository.findById(fromAccountId).orElseThrow(() -> new AccountNotFoundException(fromAccountId));
        Account toAccount =
                accountRepository.findById(toAccountId).orElseThrow(() -> new AccountNotFoundException(toAccountId));

        if (fromAccount.getBalance().compareTo(amount) < 0) {
            throw new InsufficientBalanceException(fromAccount.getId());
        }

        fromAccount.debit(amount);
        toAccount.credit(amount);

        Transfer transfer = transferRepository.findById(transferId).orElseThrow();
        transfer.markCompleted();
        return transfer;
    }

    /** Own transaction, called after {@link #executeAndComplete} threw — that one already rolled back. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(UUID transferId) {
        transferRepository.findById(transferId).ifPresent(Transfer::markFailed);
    }
}
