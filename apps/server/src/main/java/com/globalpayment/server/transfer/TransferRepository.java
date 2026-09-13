package com.globalpayment.server.transfer;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransferRepository extends JpaRepository<Transfer, UUID> {

    Optional<Transfer> findByIdempotencyKey(String idempotencyKey);

    @Query("select t from Transfer t where t.fromAccountId = :accountId or t.toAccountId = :accountId")
    List<Transfer> findInvolvingAccount(@Param("accountId") UUID accountId);

    /** Feeds {@link TransferEventPublisher} — every COMPLETED transfer not yet published. */
    List<Transfer> findByStatusAndNotifiedAtIsNull(TransferStatus status);

    /**
     * The guarded FAILED -> PROCESSING transition (server README §4): the {@code status = 'FAILED'}
     * predicate is what makes this a compare-and-swap rather than a bare update — without it, two
     * concurrent retries of the same failed key could both "succeed" and both execute the
     * transfer. A return value of 0 means this caller lost that race.
     */
    @Modifying
    @Query("update Transfer t set t.status = com.globalpayment.server.transfer.TransferStatus.PROCESSING "
            + "where t.id = :id and t.status = com.globalpayment.server.transfer.TransferStatus.FAILED")
    int reclaimFailed(@Param("id") UUID id);
}
