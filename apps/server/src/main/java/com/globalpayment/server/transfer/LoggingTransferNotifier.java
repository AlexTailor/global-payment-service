package com.globalpayment.server.transfer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stand-in for a real webhook/message-broker call (server README §7) — a structured log line
 * consumers could tail is a legitimate simplification at this scope. Swapping this for a real
 * HTTP client (e.g. a {@code RestClient} POST) is the extension point once a real Fraud
 * Detection/Notification Center endpoint exists — the outbox mechanism (durability, retry on
 * failure) doesn't change either way, only the transport does (root README TODO).
 */
@Component
public class LoggingTransferNotifier implements TransferNotifier {

    private static final Logger log = LoggerFactory.getLogger(LoggingTransferNotifier.class);

    @Override
    public void notify(TransferCompletedEvent event) {
        log.info("TRANSFER_COMPLETED {}", event);
    }
}
