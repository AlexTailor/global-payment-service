package com.globalpayment.server.transfer;

import java.util.UUID;

public class InsufficientBalanceException extends RuntimeException {

    public InsufficientBalanceException(UUID accountId) {
        super("Account " + accountId + " has insufficient balance for this transfer");
    }
}
