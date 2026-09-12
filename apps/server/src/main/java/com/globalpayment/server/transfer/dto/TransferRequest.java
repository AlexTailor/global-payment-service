package com.globalpayment.server.transfer.dto;

import com.globalpayment.server.common.Currency;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record TransferRequest(
        @NotNull UUID fromAccountId,
        @NotNull UUID toAccountId,
        @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal amount,
        @NotNull Currency currency) {
}
