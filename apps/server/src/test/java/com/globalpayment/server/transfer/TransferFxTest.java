package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.common.Currency;
import com.globalpayment.server.fx.ExchangeRateClient;
import com.globalpayment.server.fx.ExchangeRateUnavailableException;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Uses a {@link MockitoBean}-replaced {@link ExchangeRateClient} instead of the real
 * {@code MockExchangeRateClient} — the real one is deliberately randomized (server README §6),
 * which would make assertions here flaky. This tests TransferService's own integration with the
 * FX client (rate application, failure handling), not Resilience4j's or the mock's own behavior.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TransferFxTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountRepository accountRepository;

    @MockitoBean
    private ExchangeRateClient exchangeRateClient;

    @Test
    void completesACrossCurrencyTransferUsingTheResolvedRate() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.USD, BigDecimal.valueOf(0)));
        when(exchangeRateClient.getRate(Currency.EUR, Currency.USD))
                .thenReturn(CompletableFuture.completedFuture(new BigDecimal("1.08")));

        mockMvc.perform(post("/api/transfers")
                        .header("X-Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {
                                  "fromAccountId": "%s",
                                  "toAccountId": "%s",
                                  "amount": 10,
                                  "currency": "EUR"
                                }
                                """
                                        .formatted(from.getId(), to.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.exchangeRate").value(1.08));

        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("90");
        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10.80");
    }

    @Test
    void marksTheTransferFailedAndReturns503WhenTheRateCannotBeResolved() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.USD, BigDecimal.valueOf(0)));
        CompletableFuture<BigDecimal> failed = new CompletableFuture<>();
        failed.completeExceptionally(new ExchangeRateUnavailableException(Currency.EUR, Currency.USD, null));
        when(exchangeRateClient.getRate(any(), any())).thenReturn(failed);
        String key = UUID.randomUUID().toString();

        mockMvc.perform(post("/api/transfers")
                        .header("X-Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {
                                  "fromAccountId": "%s",
                                  "toAccountId": "%s",
                                  "amount": 10,
                                  "currency": "EUR"
                                }
                                """
                                        .formatted(from.getId(), to.getId())))
                .andExpect(status().isServiceUnavailable());

        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("100"); // nothing moved
    }
}
