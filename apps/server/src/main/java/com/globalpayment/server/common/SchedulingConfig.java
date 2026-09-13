package com.globalpayment.server.common;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables {@code @Scheduled} (used by {@link com.globalpayment.server.transfer.TransferEventPublisher})
 * everywhere except the {@code test} profile — tests call {@code publishPendingEvents()} directly
 * for deterministic assertions, and a real background poller running concurrently in the same
 * process could otherwise race a test's own check of {@code notified_at}.
 */
@Profile("!test")
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
