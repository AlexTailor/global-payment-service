package com.globalpayment.server.account;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;

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
}
