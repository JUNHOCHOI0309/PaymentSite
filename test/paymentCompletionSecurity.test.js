const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDraftAccessToken,
  createPaymentResultAccessToken,
  resolveApplicationOrderDetails,
  validateKcpTestDraft,
  validateKcpApprovalResult,
  validateCompletionPaymentBinding,
  validateDraftAccess,
  validateExistingPaymentReplay,
  validatePaymentResultAccess,
} = require("../server/paymentCompletionSecurity");

function createFixture(overrides = {}) {
  return {
    draft: {
      order_id: "order-1",
      payment_method: "CARD",
      name: "Test User",
      email: "USER@example.com",
      ...overrides.draft,
    },
    order: {
      order_id: "order-1",
      amount: 50000,
      status: "PAID",
      payment_provider: "kcp",
      payment_method: "CARD",
      customer_name: "Test User",
      customer_email: "user@example.com",
      ...overrides.order,
    },
    payment: {
      order_id: "order-1",
      payment_key: "kcp-tno-1",
      provider_payment_id: "kcp-tno-1",
      payment_provider: "kcp",
      status: "DONE",
      total_amount: 50000,
      ...overrides.payment,
    },
    expectedAmount: overrides.expectedAmount ?? null,
  };
}

test("derives production order details only from the draft and server pricing", () => {
  const result = resolveApplicationOrderDetails({
    draft: {
      name: "Test User",
      email: "USER@example.com",
      division: "PRO",
      discipline: "Bodybuilding",
    },
    pricing: { amount: 70000 },
  });

  assert.deepEqual(result, {
    ok: true,
    amount: 70000,
    customerName: "Test User",
    customerEmail: "user@example.com",
    orderName: "Bodybuilding 참가 신청",
    paymentProvider: "kcp",
  });
});

test("accepts only a complete KCP approval matching server values", () => {
  const expected = {
    responseCode: "0000",
    approvedOrderId: "order-1",
    approvedAmount: 50000,
    approvedPayType: "PACA",
    expectedOrderId: "order-1",
    expectedAmount: 50000,
    expectedPayType: "PACA",
  };

  assert.equal(validateKcpApprovalResult(expected).ok, true);

  for (const [override, code] of [
    [{ approvedOrderId: null }, "KCP_ORDER_ID_MISMATCH"],
    [{ approvedOrderId: "order-2" }, "KCP_ORDER_ID_MISMATCH"],
    [{ approvedAmount: null }, "KCP_AMOUNT_MISMATCH"],
    [{ approvedAmount: 100 }, "KCP_AMOUNT_MISMATCH"],
    [{ approvedPayType: null }, "KCP_PAY_TYPE_MISMATCH"],
    [{ approvedPayType: "PABK" }, "KCP_PAY_TYPE_MISMATCH"],
  ]) {
    assert.equal(validateKcpApprovalResult({ ...expected, ...override }).code, code);
  }
});

test("rejects a test draft on the production order path", () => {
  const result = resolveApplicationOrderDetails({
    draft: { name: "Test", email: "test@example.com", division: "TEST", discipline: "TEST" },
    pricing: { amount: 100 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "TEST_DRAFT_NOT_ALLOWED");
});

test("accepts only an unbound TEST draft on the KCP test path", () => {
  assert.equal(
    validateKcpTestDraft({
      division: "TEST",
      order_id: null,
      name: "KCP Test",
      email: "test@example.com",
    }).ok,
    true
  );
  assert.equal(
    validateKcpTestDraft({
      division: "PRO",
      order_id: null,
      name: "KCP Test",
      email: "test@example.com",
    }).code,
    "KCP_TEST_DRAFT_REQUIRED"
  );
});

test("grants payment result access only for the matching unexpired token", () => {
  const secret = "test-secret-with-enough-entropy";
  const orderId = "order-1";
  const now = Date.now();
  const token = createPaymentResultAccessToken({ orderId, secret, ttlSeconds: 60, now });

  assert.equal(validatePaymentResultAccess({ providedToken: token, orderId, secret, now }).ok, true);
  assert.equal(
    validatePaymentResultAccess({ providedToken: "different", orderId, secret, now }).code,
    "PAYMENT_RESULT_ACCESS_DENIED"
  );
  assert.equal(
    validatePaymentResultAccess({
      providedToken: token,
      orderId: "order-2",
      secret,
      now,
    }).code,
    "PAYMENT_RESULT_ACCESS_DENIED"
  );
  assert.equal(
    validatePaymentResultAccess({
      providedToken: token,
      orderId,
      secret,
      now: now + 61_000,
    }).code,
    "PAYMENT_RESULT_ACCESS_DENIED"
  );
});

test("grants draft access only for the matching type and unexpired draft", () => {
  const secret = "test-secret-with-enough-entropy";
  const now = Date.now();
  const token = createDraftAccessToken({
    draftId: "draft-1",
    draftType: "application",
    secret,
    ttlSeconds: 60,
    now,
  });

  assert.equal(
    validateDraftAccess({
      providedToken: token,
      draftId: "draft-1",
      draftType: "application",
      secret,
      now,
    }).ok,
    true
  );
  assert.equal(
    validateDraftAccess({
      providedToken: token,
      draftId: "draft-2",
      draftType: "application",
      secret,
      now,
    }).code,
    "DRAFT_ACCESS_DENIED"
  );
  assert.equal(
    validateDraftAccess({
      providedToken: token,
      draftId: "draft-1",
      draftType: "stage-service",
      secret,
      now,
    }).code,
    "DRAFT_ACCESS_DENIED"
  );
  assert.equal(
    validateDraftAccess({
      providedToken: token,
      draftId: "draft-1",
      draftType: "application",
      secret,
      now: now + 61_000,
    }).code,
    "DRAFT_ACCESS_DENIED"
  );
});

test("accepts a fully bound KCP payment", () => {
  const result = validateCompletionPaymentBinding(createFixture({ expectedAmount: 50000 }));
  assert.equal(result.ok, true);
  assert.equal(result.orderAmount, 50000);
  assert.equal(result.paymentKey, "kcp-tno-1");
});

test("accepts only an unchanged completed payment replay", () => {
  const fixture = createFixture();

  assert.equal(
    validateExistingPaymentReplay({ order: fixture.order, payment: fixture.payment }).ok,
    true
  );
  assert.equal(
    validateExistingPaymentReplay({
      order: fixture.order,
      payment: { ...fixture.payment, status: "CANCELED" },
    }).code,
    "KCP_EXISTING_PAYMENT_MISMATCH"
  );
  assert.equal(
    validateExistingPaymentReplay({
      order: fixture.order,
      payment: { ...fixture.payment, total_amount: 100 },
    }).code,
    "KCP_EXISTING_PAYMENT_MISMATCH"
  );
});

for (const [name, overrides, expectedCode] of [
  ["rejects a different draft order", { draft: { order_id: "order-2" } }, "DRAFT_ORDER_MISMATCH"],
  ["rejects a different payment order", { payment: { order_id: "order-2" } }, "PAYMENT_ORDER_MISMATCH"],
  ["rejects an unpaid order", { order: { status: "READY" } }, "PAYMENT_NOT_COMPLETED"],
  ["rejects a canceled payment", { payment: { status: "CANCELED" } }, "PAYMENT_NOT_COMPLETED"],
  ["rejects a non-KCP payment", { payment: { payment_provider: "toss" } }, "PAYMENT_PROVIDER_MISMATCH"],
  ["rejects an amount mismatch", { payment: { total_amount: 100 } }, "PAYMENT_AMOUNT_MISMATCH"],
  ["rejects a draft amount mismatch", { expectedAmount: 100 }, "DRAFT_AMOUNT_MISMATCH"],
  ["rejects a different customer", { order: { customer_email: "other@example.com" } }, "ORDER_CUSTOMER_MISMATCH"],
  ["rejects a different payment method", { order: { payment_method: "BANK" } }, "PAYMENT_METHOD_MISMATCH"],
  ["rejects a missing provider transaction", { payment: { provider_payment_id: null } }, "PROVIDER_TRANSACTION_MISMATCH"],
]) {
  test(name, () => {
    const result = validateCompletionPaymentBinding(createFixture(overrides));
    assert.equal(result.ok, false);
    assert.equal(result.code, expectedCode);
  });
}
