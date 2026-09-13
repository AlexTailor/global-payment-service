package com.globalpayment.server.fx;

import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.concurrent.CompletableFuture;

/**
 * {@code getRate(from, to)} returns units of {@code to} per 1 unit of {@code from} — e.g.
 * {@code getRate(USD, EUR)} ≈ {@code 0.92}, so {@code amount_usd * rate = amount_eur} (server
 * README §6). Async so a real timeout can be enforced by {@code @TimeLimiter} on the
 * implementation — a synchronous method can't be time-limited by Resilience4j at all.
 */
public interface ExchangeRateClient {

    CompletableFuture<BigDecimal> getRate(Currency from, Currency to);
}
