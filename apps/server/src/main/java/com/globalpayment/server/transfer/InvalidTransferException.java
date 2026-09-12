package com.globalpayment.server.transfer;

/**
 * Cross-field/cross-entity validation that plain bean validation on the request DTO can't
 * express (it needs the looked-up accounts) — mapped to {@code 400}, see server README §3/§8.
 */
public class InvalidTransferException extends RuntimeException {

    public InvalidTransferException(String message) {
        super(message);
    }
}
