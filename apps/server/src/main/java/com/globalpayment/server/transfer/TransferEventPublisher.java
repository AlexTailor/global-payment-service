package com.globalpayment.server.transfer;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Polls for COMPLETED transfers not yet published and publishes each one (server README §7).
 * Deliberately not {@code @Transactional} itself: {@code transferRepository.save} already
 * commits per call (Spring Data's own per-method transaction boundary), so one transfer's
 * publish failure can't roll back another's already-recorded {@code notified_at} in the same
 * poll.
 */
@Component
public class TransferEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(TransferEventPublisher.class);

    private final TransferRepository transferRepository;
    private final TransferNotifier transferNotifier;

    public TransferEventPublisher(TransferRepository transferRepository, TransferNotifier transferNotifier) {
        this.transferRepository = transferRepository;
        this.transferNotifier = transferNotifier;
    }

    @Scheduled(fixedDelay = 1000)
    public void publishPendingEvents() {
        List<Transfer> pending = transferRepository.findByStatusAndNotifiedAtIsNull(TransferStatus.COMPLETED);
        for (Transfer transfer : pending) {
            try {
                transferNotifier.notify(TransferCompletedEvent.from(transfer));
                transfer.markNotified();
                transferRepository.save(transfer);
            } catch (RuntimeException failure) {
                // leave notified_at null -- at-least-once delivery, retried on the next poll
                log.warn("Failed to publish TRANSFER_COMPLETED for transfer {}; will retry", transfer.getId(), failure);
            }
        }
    }
}
