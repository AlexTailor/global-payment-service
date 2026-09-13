package com.globalpayment.server.transfer;

/** Port for telling the rest of the (imagined) larger system about a completed transfer. */
public interface TransferNotifier {

    /** Throw to signal a failed delivery — {@link TransferEventPublisher} retries on the next poll. */
    void notify(TransferCompletedEvent event);
}
