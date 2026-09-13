package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * The unit tests in {@link TransferEventPublisherTest} cover the publish/retry logic
 * deterministically; this checks the real repository query and full wiring (real bean, real H2)
 * actually work together — not @Scheduled's timer, which is irrelevant to what could break here.
 */
@SpringBootTest
class TransferEventPublisherIntegrationTest {

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private TransferRepository transferRepository;

    @Autowired
    private TransferEventPublisher transferEventPublisher;

    @Test
    void marksARealCompletedTransferAsNotifiedAgainstTheRealDatabase() {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(0)));
        Transfer transfer = transferRepository.save(new Transfer(
                java.util.UUID.randomUUID().toString(),
                from.getId(),
                to.getId(),
                BigDecimal.TEN,
                Currency.EUR,
                Currency.EUR,
                null,
                TransferStatus.COMPLETED));
        assertThat(transfer.getNotifiedAt()).isNull();

        transferEventPublisher.publishPendingEvents();

        assertThat(transferRepository.findById(transfer.getId()).orElseThrow().getNotifiedAt())
                .isNotNull();
    }
}
