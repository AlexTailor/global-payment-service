package com.globalpayment.server.account;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountRepository accountRepository;

    @Test
    void createAccountReturnsCreatedAccount() throws Exception {
        String requestBody =
                """
                {
                  "ownerName": "Ada Lovelace",
                  "currency": "EUR",
                  "initialBalance": 100.00
                }
                """;

        mockMvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.ownerName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.currency").value("EUR"))
                .andExpect(jsonPath("$.balance").value(100.00));
    }

    @Test
    void createAccountRejectsNegativeBalance() throws Exception {
        String requestBody =
                """
                {
                  "ownerName": "Ada Lovelace",
                  "currency": "EUR",
                  "initialBalance": -1
                }
                """;

        mockMvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listAccountsIncludesNewlyCreatedAccount() throws Exception {
        String requestBody =
                """
                {
                  "ownerName": "Katherine Johnson",
                  "currency": "HUF",
                  "initialBalance": 5000
                }
                """;

        mockMvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/accounts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].ownerName", hasItem("Katherine Johnson")));
    }

    @Test
    void getAccountReturnsTheMatchingAccount() throws Exception {
        Account account = accountRepository.save(new Account("Grace Hopper", Currency.USD, BigDecimal.TEN));

        mockMvc.perform(get("/api/accounts/{id}", account.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(account.getId().toString()))
                .andExpect(jsonPath("$.ownerName").value("Grace Hopper"));
    }

    @Test
    void getAccountReturnsNotFoundForUnknownId() throws Exception {
        mockMvc.perform(get("/api/accounts/{id}", UUID.randomUUID())).andExpect(status().isNotFound());
    }
}
