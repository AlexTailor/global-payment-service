package com.globalpayment.server.fx;

/** Thrown by {@link MockExchangeRateClient} to simulate a flaky external API's {@code 503}. */
public class TransientFxFailureException extends RuntimeException {

    public TransientFxFailureException() {
        super("Simulated FX provider failure");
    }
}
