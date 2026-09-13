package com.globalpayment.server.fx;

import com.globalpayment.server.common.Currency;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

/**
 * Decided (server README §6): the flaky external API is simulated in-process — no real HTTP
 * call, no separate mock server, nothing added to docker-compose.yml. Randomly throws {@link
 * TransientFxFailureException} (simulating a {@code 503}) and randomly sleeps (simulating
 * latency), at rates tuned to actually exercise the retry/circuit-breaker/timeout below rather
 * than almost never triggering them.
 */
@Component
public class MockExchangeRateClient implements ExchangeRateClient {

    /** Roughly a 6% chance all 3 retry attempts fail (0.4^3), enough to exercise retries without
     * making most transfers fail outright. */
    private static final double FAILURE_PROBABILITY = 0.4;

    private static final long MAX_SIMULATED_LATENCY_MILLIS = 300;

    private static final Map<Currency, BigDecimal> UNITS_PER_EUR = new EnumMap<>(Currency.class);

    static {
        UNITS_PER_EUR.put(Currency.EUR, BigDecimal.ONE);
        UNITS_PER_EUR.put(Currency.USD, new BigDecimal("1.08"));
        UNITS_PER_EUR.put(Currency.HUF, new BigDecimal("395.00"));
    }

    @Retry(name = "fx")
    @CircuitBreaker(name = "fx", fallbackMethod = "fallback")
    @TimeLimiter(name = "fx")
    @Override
    public CompletableFuture<BigDecimal> getRate(Currency from, Currency to) {
        return CompletableFuture.supplyAsync(() -> simulateAndComputeRate(from, to));
    }

    private BigDecimal simulateAndComputeRate(Currency from, Currency to) {
        sleepRandomly();
        if (ThreadLocalRandom.current().nextDouble() < FAILURE_PROBABILITY) {
            throw new TransientFxFailureException();
        }
        return rate(from, to);
    }

    private void sleepRandomly() {
        try {
            Thread.sleep(ThreadLocalRandom.current().nextLong(MAX_SIMULATED_LATENCY_MILLIS));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private BigDecimal rate(Currency from, Currency to) {
        BigDecimal fromUnitsPerEur = UNITS_PER_EUR.get(from);
        BigDecimal toUnitsPerEur = UNITS_PER_EUR.get(to);
        return toUnitsPerEur.divide(fromUnitsPerEur, 8, RoundingMode.HALF_UP);
    }

    /** Retries/circuit-breaker/timeout all exhausted — no cached rate to fall back to, so fail closed. */
    private CompletableFuture<BigDecimal> fallback(Currency from, Currency to, Throwable failure) {
        CompletableFuture<BigDecimal> unavailable = new CompletableFuture<>();
        unavailable.completeExceptionally(new ExchangeRateUnavailableException(from, to, failure));
        return unavailable;
    }
}
