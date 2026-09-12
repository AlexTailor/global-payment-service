package com.globalpayment.server.transfer.dto;

import com.globalpayment.server.common.Currency;
import com.globalpayment.server.transfer.Transfer;
import com.globalpayment.server.transfer.TransferStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record TransferResponse(
        UUID id,
        UUID fromAccountId,
        UUID toAccountId,
        BigDecimal amount,
        Currency sourceCurrency,
        Currency targetCurrency,
        BigDecimal exchangeRate,
        TransferStatus status,
        Instant createdAt) {

    public static TransferResponse from(Transfer transfer) {
        return new TransferResponse(
                transfer.getId(),
                transfer.getFromAccountId(),
                transfer.getToAccountId(),
                transfer.getAmount(),
                transfer.getSourceCurrency(),
                transfer.getTargetCurrency(),
                transfer.getExchangeRate(),
                transfer.getStatus(),
                transfer.getCreatedAt());
    }
}
