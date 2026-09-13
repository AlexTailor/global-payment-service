package com.globalpayment.server.transfer;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountNotFoundException;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.transfer.dto.TransferRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Deliberately not {@code @Transactional} — this is a plain orchestrator over
 * {@link TransferPersistence}'s three separately-transactional steps (server README §4). FX/
 * cross-currency transfers and optimistic-lock retry on the account updates aren't implemented
 * yet; both are the next build-order steps (root README TODO).
 */
@Service
public class TransferService {

    private final AccountRepository accountRepository;
    private final TransferPersistence transferPersistence;

    public TransferService(AccountRepository accountRepository, TransferPersistence transferPersistence) {
        this.accountRepository = accountRepository;
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
            return transferPersistence.executeAndComplete(
                    owned.getId(), owned.getFromAccountId(), owned.getToAccountId(), owned.getAmount());
        } catch (RuntimeException failure) {
            transferPersistence.markFailed(owned.getId());
            throw failure;
        }
    }
}
