package com.globalpayment.server.account.dto;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.UUID;

public record AccountResponse(UUID id, String ownerName, Currency currency, BigDecimal balance) {

    public static AccountResponse from(Account account) {
        return new AccountResponse(
                account.getId(), account.getOwnerName(), account.getCurrency(), account.getBalance());
    }
}
