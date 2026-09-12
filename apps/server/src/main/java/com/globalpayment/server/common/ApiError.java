package com.globalpayment.server.common;

import java.time.Instant;

public record ApiError(int code, String message, Instant timestamp) {

    public static ApiError of(int code, String message) {
        return new ApiError(code, message, Instant.now());
    }
}
