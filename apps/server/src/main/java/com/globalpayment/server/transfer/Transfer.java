package com.globalpayment.server.transfer;

import com.globalpayment.server.common.Currency;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "transfer")
public class Transfer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "from_account_id", nullable = false)
    private UUID fromAccountId;

    @Column(name = "to_account_id", nullable = false)
    private UUID toAccountId;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_currency", nullable = false, length = 3)
    private Currency sourceCurrency;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_currency", nullable = false, length = 3)
    private Currency targetCurrency;

    @Column(name = "exchange_rate", precision = 19, scale = 8)
    private BigDecimal exchangeRate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TransferStatus status;

    @Column(name = "notified_at")
    private Instant notifiedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Transfer() {
        // JPA
    }

    public Transfer(
            String idempotencyKey,
            UUID fromAccountId,
            UUID toAccountId,
            BigDecimal amount,
            Currency sourceCurrency,
            Currency targetCurrency,
            BigDecimal exchangeRate,
            TransferStatus status) {
        this.idempotencyKey = idempotencyKey;
        this.fromAccountId = fromAccountId;
        this.toAccountId = toAccountId;
        this.amount = amount;
        this.sourceCurrency = sourceCurrency;
        this.targetCurrency = targetCurrency;
        this.exchangeRate = exchangeRate;
        this.status = status;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public UUID getFromAccountId() {
        return fromAccountId;
    }

    public UUID getToAccountId() {
        return toAccountId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public Currency getSourceCurrency() {
        return sourceCurrency;
    }

    public Currency getTargetCurrency() {
        return targetCurrency;
    }

    public BigDecimal getExchangeRate() {
        return exchangeRate;
    }

    public TransferStatus getStatus() {
        return status;
    }

    public Instant getNotifiedAt() {
        return notifiedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void markCompleted(BigDecimal exchangeRate) {
        this.exchangeRate = exchangeRate;
        this.status = TransferStatus.COMPLETED;
    }

    public void markFailed() {
        this.status = TransferStatus.FAILED;
    }
}
