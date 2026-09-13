package com.globalpayment.server.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalpayment.server.account.Account;
import com.globalpayment.server.account.AccountRepository;
import com.globalpayment.server.common.Currency;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class TransferIdempotencyTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private TransferRepository transferRepository;

    private MockHttpServletRequestBuilder transferRequest(
            String idempotencyKey, UUID from, UUID to, String amount, Currency currency) {
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
                .header("X-Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private String extractField(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    @Test
    void replayingACompletedKeyReturnsTheOriginalTransferWithoutMovingTheBalanceAgain() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(0)));
        String key = UUID.randomUUID().toString();

        MvcResult first = mockMvc.perform(transferRequest(key, from.getId(), to.getId(), "40", Currency.EUR))
                .andExpect(status().isCreated())
                .andReturn();
        String firstId = extractField(first.getResponse().getContentAsString(), "id");

        mockMvc.perform(transferRequest(key, from.getId(), to.getId(), "40", Currency.EUR))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(firstId))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("60");
        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("40");
    }

    @Test
    void retryingAFailedKeyReprocessesFromScratchOnceTheFailureConditionIsGone() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(5)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(0)));
        String key = UUID.randomUUID().toString();

        mockMvc.perform(transferRequest(key, from.getId(), to.getId(), "10", Currency.EUR))
                .andExpect(status().isConflict()); // insufficient balance -> transfer row left FAILED

        Transfer failed = transferRepository.findByIdempotencyKey(key).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo(TransferStatus.FAILED);

        from.credit(BigDecimal.valueOf(20)); // top up so the retry can actually succeed
        accountRepository.save(from);

        mockMvc.perform(transferRequest(key, from.getId(), to.getId(), "10", Currency.EUR))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.id").value(failed.getId().toString()));

        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10");
    }

    @Test
    void concurrentRequestsWithTheSameNewKeyExecuteExactlyOnce() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(0)));
        String key = UUID.randomUUID().toString();

        List<Integer> statuses = fireConcurrently(() -> mockMvc.perform(
                        transferRequest(key, from.getId(), to.getId(), "10", Currency.EUR))
                .andReturn()
                .getResponse()
                .getStatus());

        assertThat(statuses).allMatch(status -> status == 201 || status == 409);
        assertThat(statuses).contains(201);
        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("90");
        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10");
    }

    @Test
    void concurrentRetriesOfTheSameFailedKeyExecuteExactlyOnce() throws Exception {
        Account from = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account to = accountRepository.save(new Account("Payee", Currency.EUR, BigDecimal.valueOf(0)));
        String key = UUID.randomUUID().toString();
        Transfer failedAttempt = transferRepository.save(new Transfer(
                key,
                from.getId(),
                to.getId(),
                BigDecimal.TEN,
                Currency.EUR,
                Currency.EUR,
                null,
                TransferStatus.FAILED));

        List<Integer> statuses = fireConcurrently(() -> mockMvc.perform(
                        transferRequest(key, from.getId(), to.getId(), "10", Currency.EUR))
                .andReturn()
                .getResponse()
                .getStatus());

        assertThat(statuses).allMatch(status -> status == 201 || status == 409);
        assertThat(statuses).contains(201);
        assertThat(accountRepository.findById(from.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("90");
        assertThat(accountRepository.findById(to.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10");
        assertThat(transferRepository.findById(failedAttempt.getId()).orElseThrow().getStatus())
                .isEqualTo(TransferStatus.COMPLETED);
    }

    @Test
    void concurrentTransfersWithDifferentKeysOnTheSameAccountBothSucceed() throws Exception {
        // Independent of idempotency (server README §5): two different keys, same source
        // account, at once. In practice two real threads usually just serialize cleanly rather
        // than genuinely interleave, so this doesn't reliably prove the optimistic-lock retry
        // itself fires — TransferServiceRetryTest proves that deterministically with a mocked
        // TransferPersistence. This test is about the end state: concurrent access to the same
        // account must never corrupt a balance or crash unhandled, retry or no retry.
        Account shared = accountRepository.save(new Account("Payer", Currency.EUR, BigDecimal.valueOf(100)));
        Account toB = accountRepository.save(new Account("PayeeB", Currency.EUR, BigDecimal.valueOf(0)));
        Account toC = accountRepository.save(new Account("PayeeC", Currency.EUR, BigDecimal.valueOf(0)));
        String keyToB = UUID.randomUUID().toString();
        String keyToC = UUID.randomUUID().toString();

        List<Integer> statuses = fireConcurrentlyWith(
                () -> mockMvc.perform(transferRequest(keyToB, shared.getId(), toB.getId(), "10", Currency.EUR))
                        .andReturn()
                        .getResponse()
                        .getStatus(),
                () -> mockMvc.perform(transferRequest(keyToC, shared.getId(), toC.getId(), "10", Currency.EUR))
                        .andReturn()
                        .getResponse()
                        .getStatus());

        assertThat(statuses).containsExactly(201, 201);
        assertThat(accountRepository.findById(shared.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("80");
        assertThat(accountRepository.findById(toB.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10");
        assertThat(accountRepository.findById(toC.getId()).orElseThrow().getBalance())
                .isEqualByComparingTo("10");
    }

    /** Starts two copies of the same call at (as close as possible to) the same instant. */
    private List<Integer> fireConcurrently(Callable<Integer> call) throws Exception {
        return fireConcurrentlyWith(call, call);
    }

    /** Starts both calls at (as close as possible to) the same instant. */
    @SafeVarargs
    private List<Integer> fireConcurrentlyWith(Callable<Integer>... calls) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(calls.length);
        CountDownLatch ready = new CountDownLatch(calls.length);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = Arrays.stream(calls)
                    .map(call -> executor.submit(() -> {
                        ready.countDown();
                        start.await();
                        return call.call();
                    }))
                    .toList();
            ready.await();
            start.countDown();

            List<Integer> results = new ArrayList<>();
            for (Future<Integer> future : futures) {
                results.add(future.get());
            }
            return results;
        } finally {
            executor.shutdown();
        }
    }
}
