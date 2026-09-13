package com.globalpayment.server.fx;

import com.globalpayment.server.common.Currency;

/** Thrown once retries/circuit-breaker/timeout are all exhausted — mapped to {@code 503}. */
public class ExchangeRateUnavailableException extends RuntimeException {

    public ExchangeRateUnavailableException(Currency from, Currency to, Throwable cause) {
        super("Exchange rate unavailable for " + from + " -> " + to, cause);
    }
}
