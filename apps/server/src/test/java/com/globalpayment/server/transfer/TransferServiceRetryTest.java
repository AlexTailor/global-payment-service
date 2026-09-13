package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.common.Currency;
import com.globalpayment.server.transfer.dto.TransferRequest;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * Real-thread concurrency (see {@link TransferIdempotencyTest}) can prove the end state is
 * correct under contention, but can't reliably force two transactions to genuinely interleave —
 * in practice they usually just serialize cleanly, so the retry path in
 * {@link TransferService#createTransfer} never actually fires even when the test "looks"
 * concurrent. These tests instead mock {@link TransferPersistence} to deterministically produce
 * the conflict, verifying the retry loop itself (server README §5) rather than hoping for one.
 */
@ExtendWith(MockitoExtension.class)
class TransferServiceRetryTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private TransferRepository transferRepository;

    @Mock
    private TransferPersistence transferPersistence;

    private final UUID fromId = UUID.randomUUID();
    private final UUID toId = UUID.randomUUID();
    private final Account fromAccount = new Account("Payer", Currency.EUR, BigDecimal.valueOf(100));
    private final Account toAccount = new Account("Payee", Currency.EUR, BigDecimal.valueOf(0));

    private TransferService newTransferService() {
        return new TransferService(accountRepository, transferRepository, transferPersistence);
    }

    private void stubAccountLookups() {
        when(accountRepository.findById(fromId)).thenReturn(Optional.of(fromAccount));
        when(accountRepository.findById(toId)).thenReturn(Optional.of(toAccount));
    }

    @Test
    void retriesOnOptimisticLockConflictAndSucceedsOnceTheContentionClears() {
        stubAccountLookups();
        String key = UUID.randomUUID().toString();
        Transfer processing = new Transfer(
                key, fromId, toId, BigDecimal.TEN, Currency.EUR, Currency.EUR, null, TransferStatus.PROCESSING);
        Transfer completed = new Transfer(
                key, fromId, toId, BigDecimal.TEN, Currency.EUR, Currency.EUR, null, TransferStatus.COMPLETED);

        when(transferPersistence.attemptClaim(any())).thenReturn(processing);
        when(transferPersistence.executeAndComplete(any(), any(), any(), any()))
                .thenThrow(new ObjectOptimisticLockingFailureException(Account.class, fromId))
                .thenReturn(completed);

        Transfer result = newTransferService()
                .createTransfer(new TransferRequest(fromId, toId, BigDecimal.TEN, Currency.EUR), key);

        assertThat(result.getStatus()).isEqualTo(TransferStatus.COMPLETED);
        verify(transferPersistence, times(2)).executeAndComplete(any(), any(), any(), any());
        verify(transferPersistence, times(0)).markFailed(any());
    }

    @Test
    void givesUpAfterExhaustingRetriesAndMarksTheTransferFailed() {
        stubAccountLookups();
        String key = UUID.randomUUID().toString();
        Transfer processing = new Transfer(
                key, fromId, toId, BigDecimal.TEN, Currency.EUR, Currency.EUR, null, TransferStatus.PROCESSING);

        when(transferPersistence.attemptClaim(any())).thenReturn(processing);
        when(transferPersistence.executeAndComplete(any(), any(), any(), any()))
                .thenThrow(new ObjectOptimisticLockingFailureException(Account.class, fromId));

        assertThatThrownBy(() -> newTransferService()
                        .createTransfer(new TransferRequest(fromId, toId, BigDecimal.TEN, Currency.EUR), key))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);

        verify(transferPersistence, times(3)).executeAndComplete(any(), any(), any(), any());
        verify(transferPersistence, times(1)).markFailed(any());
    }
}
