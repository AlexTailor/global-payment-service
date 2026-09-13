package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TransferEventPublisherTest {

    @Mock
    private TransferRepository transferRepository;

    @Mock
    private TransferNotifier transferNotifier;

    private Transfer completedUnnotifiedTransfer() {
        return new Transfer(
                UUID.randomUUID().toString(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                BigDecimal.TEN,
                Currency.EUR,
                Currency.EUR,
                null,
                TransferStatus.COMPLETED);
    }

    @Test
    void publishesEachPendingTransferAndMarksItNotified() {
        Transfer transfer = completedUnnotifiedTransfer();
        when(transferRepository.findByStatusAndNotifiedAtIsNull(TransferStatus.COMPLETED))
                .thenReturn(List.of(transfer));

        new TransferEventPublisher(transferRepository, transferNotifier).publishPendingEvents();

        verify(transferNotifier, times(1)).notify(TransferCompletedEvent.from(transfer));
        assertThat(transfer.getNotifiedAt()).isNotNull();
        verify(transferRepository).save(transfer);
    }

    @Test
    void leavesNotifiedAtNullWhenDeliveryFailsSoItsRetriedOnTheNextPoll() {
        Transfer transfer = completedUnnotifiedTransfer();
        when(transferRepository.findByStatusAndNotifiedAtIsNull(TransferStatus.COMPLETED))
                .thenReturn(List.of(transfer));
        doThrow(new RuntimeException("webhook unreachable")).when(transferNotifier).notify(any());

        new TransferEventPublisher(transferRepository, transferNotifier).publishPendingEvents();

        assertThat(transfer.getNotifiedAt()).isNull();
        verify(transferRepository, never()).save(any());
    }

    @Test
    void oneFailureDoesNotStopTheOthersInTheSamePoll() {
        Transfer failing = completedUnnotifiedTransfer();
        Transfer succeeding = completedUnnotifiedTransfer();
        when(transferRepository.findByStatusAndNotifiedAtIsNull(TransferStatus.COMPLETED))
                .thenReturn(List.of(failing, succeeding));
        doThrow(new RuntimeException("webhook unreachable"))
                .when(transferNotifier)
                .notify(TransferCompletedEvent.from(failing));

        new TransferEventPublisher(transferRepository, transferNotifier).publishPendingEvents();

        assertThat(failing.getNotifiedAt()).isNull();
        assertThat(succeeding.getNotifiedAt()).isNotNull();
        verify(transferRepository).save(succeeding);
        verify(transferRepository, never()).save(failing);
    }
}
