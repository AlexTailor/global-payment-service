package com.globalpayment.server.account.dto;

import com.globalpayment.server.common.Currency;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record CreateAccountRequest(
        @NotBlank String ownerName,
        @NotNull Currency currency,
        @NotNull @DecimalMin(value = "0", inclusive = true) BigDecimal initialBalance) {
}
