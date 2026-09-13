package com.globalpayment.server.transfer;

/**
 * Either the same key is currently PROCESSING on another concurrent request, or a retry of a
 * FAILED key lost the race to claim the row to another concurrent retry. Both are the client's
 * cue to back off and try again shortly — mapped to {@code 409}, see server README §4/§8.
 */
public class IdempotencyConflictException extends RuntimeException {

    public IdempotencyConflictException(String idempotencyKey) {
        super("Transfer with idempotency key " + idempotencyKey + " is already being processed");
    }
}
