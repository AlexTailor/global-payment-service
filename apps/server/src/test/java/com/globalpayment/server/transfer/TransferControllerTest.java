package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class TransferControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountRepository accountRepository;

    private MockHttpServletRequestBuilder transferRequest(UUID from, UUID to, String amount, Currency currency) {
        String body =
                """
                {
                  "fromAccountId": "%s",
                  "toAccountId": "%s",
                  "amount": %s,
                  "currency": "%s"
                }
                """
                        .formatted(from, to, amount, currency);
        return post("/api/transfers")
                .header("X-Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    @Test
    void completesASameCurrencyTransferAndMovesTheBalance() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));

        mockMvc.perform(transferRequest(from.getId(), to.getId(), "40", Currency.EUR))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.sourceCurrency").value("EUR"))
                .andExpect(jsonPath("$.targetCurrency").value("EUR"));

        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("60");
        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("50");
    }

    @Test
    void rejectsATransferWithoutTheIdempotencyHeader() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));

        String body =
                """
                {
                  "fromAccountId": "%s",
                  "toAccountId": "%s",
                  "amount": 10,
                  "currency": "EUR"
                }
                """
                        .formatted(from.getId(), to.getId());

        mockMvc.perform(post("/api/transfers").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsATransferThatExceedsTheSourceBalance() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(5)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));

        mockMvc.perform(transferRequest(from.getId(), to.getId(), "10", Currency.EUR))
                .andExpect(status().isConflict());
    }

    @Test
    void returnsNotFoundForAnUnknownAccount() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));

        mockMvc.perform(transferRequest(from.getId(), UUID.randomUUID(), "10", Currency.EUR))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsARequestCurrencyThatDoesNotMatchTheSourceAccount() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));

        mockMvc.perform(transferRequest(from.getId(), to.getId(), "10", Currency.USD))
                .andExpect(status().isBadRequest());
    }

    // Cross-currency transfers are now supported (see TransferFxTest, which mocks
    // ExchangeRateClient for deterministic assertions rather than the real randomized one).

    @Test
    void rejectsTransferringToTheSameAccount() throws Exception {
        Account account = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));

        mockMvc.perform(transferRequest(account.getId(), account.getId(), "10", Currency.EUR))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listTransfersIncludesANewlyCreatedTransfer() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));
        String transferId = extractField(
                mockMvc.perform(transferRequest(from.getId(), to.getId(), "5", Currency.EUR))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "id");

        mockMvc.perform(get("/api/transfers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(transferId)));
    }

    @Test
    void listTransfersFiltersByAccountId() throws Exception {
        Account a = accountRepository.save(new Account("A", Currency.EUR, BigDecimal.valueOf(100)));
        Account b = accountRepository.save(new Account("B", Currency.EUR, BigDecimal.valueOf(10)));
        Account c = accountRepository.save(new Account("C", Currency.EUR, BigDecimal.valueOf(10)));

        String abTransferId = extractField(
                mockMvc.perform(transferRequest(a.getId(), b.getId(), "5", Currency.EUR))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "id");
        mockMvc.perform(transferRequest(b.getId(), c.getId(), "1", Currency.EUR)).andExpect(status().isCreated());

        mockMvc.perform(get("/api/transfers").param("accountId", a.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(abTransferId)))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void getTransferReturnsTheMatchingTransfer() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(10)));
        String transferId = extractField(
                mockMvc.perform(transferRequest(from.getId(), to.getId(), "5", Currency.EUR))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "id");

        mockMvc.perform(get("/api/transfers/{id}", transferId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(transferId))
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void getTransferReturnsNotFoundForUnknownId() throws Exception {
        mockMvc.perform(get("/api/transfers/{id}", UUID.randomUUID())).andExpect(status().isNotFound());
    }

    private String extractField(String json, String field) {
        var matcher = Pattern.compile("\"" + field + "\":\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }
}
