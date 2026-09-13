package com.globalpayment.server.account;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    /** Common find-or-404 idiom, otherwise repeated at every call site that looks up an account. */
    default Account getOrThrow(UUID id) {
        return findById(id).orElseThrow(() -> new AccountNotFoundException(id));
    }
}
