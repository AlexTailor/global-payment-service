package com.globalpayment.server.transfer;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountNotFoundException;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.transfer.dto.TransferRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TransferService {

    private final AccountRepository accountRepository;
    private final TransferRepository transferRepository;

    public TransferService(AccountRepository accountRepository, TransferRepository transferRepository) {
        this.accountRepository = accountRepository;
        this.transferRepository = transferRepository;
    }

    /**
     * Happy path only for now: no idempotency-conflict handling (a duplicate key currently hits
     * the raw DB unique constraint), no FX (only same-currency transfers), no optimistic-lock
     * retry on the account updates. All three are the next build-order steps (root README TODO).
     */
    @Transactional
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
        if (fromAccount.getBalance().compareTo(request.amount()) < 0) {
            throw new InsufficientBalanceException(fromAccount.getId());
        }

        fromAccount.debit(request.amount());
        toAccount.credit(request.amount());

        Transfer transfer = new Transfer(
                idempotencyKey,
                fromAccount.getId(),
                toAccount.getId(),
                request.amount(),
                fromAccount.getCurrency(),
                toAccount.getCurrency(),
                null,
                TransferStatus.COMPLETED);
        return transferRepository.save(transfer);
    }
}
