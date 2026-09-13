package com.globalpayment.server.transfer;

import com.globalpayment.server.transfer.dto.TransferRequest;
import com.globalpayment.server.transfer.dto.TransferResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    private final TransferService transferService;

    public TransferController(TransferService transferService) {
        this.transferService = transferService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransferResponse createTransfer(
            @RequestHeader("X-Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody TransferRequest request) {
        Transfer transfer = transferService.createTransfer(request, idempotencyKey);
        return TransferResponse.from(transfer);
    }

    @GetMapping
    public List<TransferResponse> listTransfers(@RequestParam(required = false) UUID accountId) {
        return transferService.listTransfers(accountId).stream().map(TransferResponse::from).toList();
    }

    @GetMapping("/{id}")
    public TransferResponse getTransfer(@PathVariable UUID id) {
        return TransferResponse.from(transferService.getTransfer(id));
    }
}
