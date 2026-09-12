package com.globalpayment.server.account;

import com.globalpayment.server.account.dto.CreateAccountRequest;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AccountService {

    private final AccountRepository accountRepository;

    public AccountService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    public Account createAccount(CreateAccountRequest request) {
        Account account =
                new Account(request.ownerName(), request.currency(), request.initialBalance());
        return accountRepository.save(account);
    }

    public List<Account> listAccounts() {
        return accountRepository.findAll();
    }
}
