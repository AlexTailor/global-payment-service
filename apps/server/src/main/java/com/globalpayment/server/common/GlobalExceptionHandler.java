package com.globalpayment.server.common;

import com.globalpayment.server.account.AccountNotFoundException;
import com.globalpayment.server.fx.ExchangeRateUnavailableException;
import com.globalpayment.server.transfer.IdempotencyConflictException;
import com.globalpayment.server.transfer.InsufficientBalanceException;
import com.globalpayment.server.transfer.InvalidTransferException;
import com.globalpayment.server.transfer.TransferNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Keeps services free of HTTP concerns (see apps/server/README.md §8) — they throw domain
 * exceptions, this is the only place that turns one into a status code.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler({AccountNotFoundException.class, TransferNotFoundException.class})
    public ResponseEntity<ApiError> handleNotFound(RuntimeException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(IdempotencyConflictException.class)
    public ResponseEntity<ApiError> handleIdempotencyConflict(IdempotencyConflictException ex) {
        return error(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(InsufficientBalanceException.class)
    public ResponseEntity<ApiError> handleInsufficientBalance(InsufficientBalanceException ex) {
        return error(HttpStatus.CONFLICT, ex.getMessage());
    }

    /** Bounded optimistic-lock retries exhausted (server README §5) — the client can just retry. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleOptimisticLockConflict(ObjectOptimisticLockingFailureException ex) {
        return error(HttpStatus.CONFLICT, "Too much concurrent activity on one of the accounts; please retry");
    }

    @ExceptionHandler(ExchangeRateUnavailableException.class)
    public ResponseEntity<ApiError> handleExchangeRateUnavailable(ExchangeRateUnavailableException ex) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage());
    }

    @ExceptionHandler(InvalidTransferException.class)
    public ResponseEntity<ApiError> handleInvalidTransfer(InvalidTransferException ex) {
        return error(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(ApiError.of(status.value(), message));
    }
}
