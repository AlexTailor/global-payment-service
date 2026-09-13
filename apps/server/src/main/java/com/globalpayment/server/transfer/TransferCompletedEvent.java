package com.globalpayment.server.transfer;

import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.UUID;

/** What gets published for every completed transfer (server README §7). */
public record TransferCompletedEvent(
        UUID transferId,
        UUID fromAccountId,
        UUID toAccountId,
        BigDecimal amount,
        Currency sourceCurrency,
        Currency targetCurrency,
        BigDecimal exchangeRate) {

    public static TransferCompletedEvent from(Transfer transfer) {
        return new TransferCompletedEvent(
                transfer.getId(),
                transfer.getFromAccountId(),
                transfer.getToAccountId(),
                transfer.getAmount(),
                transfer.getSourceCurrency(),
                transfer.getTargetCurrency(),
                transfer.getExchangeRate());
    }
}
