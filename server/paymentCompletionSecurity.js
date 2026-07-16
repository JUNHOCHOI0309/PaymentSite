const crypto = require("crypto");

const KCP_PROVIDER = "kcp";

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizePositiveInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function fail(code, message) {
  return { ok: false, code, message };
}

function createDraftAccessToken({ draftId, draftType, secret, ttlSeconds, now = Date.now() }) {
  const normalizedDraftId = normalizeText(draftId);
  const normalizedDraftType = normalizeText(draftType);
  const normalizedSecret = normalizeText(secret);
  const normalizedTtlSeconds = Number(ttlSeconds);

  if (
    !normalizedDraftId ||
    !normalizedDraftType ||
    !normalizedSecret ||
    !Number.isInteger(normalizedTtlSeconds) ||
    normalizedTtlSeconds <= 0
  ) {
    throw new Error("Invalid draft access token configuration");
  }

  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      typ: normalizedDraftType,
      did: normalizedDraftId,
      exp: Math.floor(now / 1000) + normalizedTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
    }),
    "utf8"
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", normalizedSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validateDraftAccess({ providedToken, draftId, draftType, secret, now = Date.now() }) {
  const normalizedToken = normalizeText(providedToken);
  const normalizedDraftId = normalizeText(draftId);
  const normalizedDraftType = normalizeText(draftType);
  const normalizedSecret = normalizeText(secret);

  if (!normalizedToken || !normalizedDraftId || !normalizedDraftType || !normalizedSecret) {
    return fail("DRAFT_ACCESS_DENIED", "신청 초안 접근 권한이 없거나 만료되었습니다.");
  }

  const [payload, providedSignature, ...extraParts] = normalizedToken.split(".");

  if (!payload || !providedSignature || extraParts.length > 0) {
    return fail("DRAFT_ACCESS_DENIED", "신청 초안 접근 권한이 없거나 만료되었습니다.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", normalizedSecret)
    .update(payload)
    .digest("base64url");
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return fail("DRAFT_ACCESS_DENIED", "신청 초안 접근 권한이 없거나 만료되었습니다.");
  }

  let decoded;

  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (_error) {
    return fail("DRAFT_ACCESS_DENIED", "신청 초안 접근 권한이 없거나 만료되었습니다.");
  }

  if (
    decoded?.v !== 1 ||
    decoded?.typ !== normalizedDraftType ||
    decoded?.did !== normalizedDraftId ||
    !Number.isInteger(decoded?.exp) ||
    decoded.exp <= Math.floor(now / 1000)
  ) {
    return fail("DRAFT_ACCESS_DENIED", "신청 초안 접근 권한이 없거나 만료되었습니다.");
  }

  return { ok: true };
}

function createPaymentResultAccessToken({ orderId, secret, ttlSeconds, now = Date.now() }) {
  const normalizedOrderId = normalizeText(orderId);
  const normalizedSecret = normalizeText(secret);
  const normalizedTtlSeconds = Number(ttlSeconds);

  if (!normalizedOrderId || !normalizedSecret || !Number.isInteger(normalizedTtlSeconds)) {
    throw new Error("Invalid payment result token configuration");
  }

  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      oid: normalizedOrderId,
      exp: Math.floor(now / 1000) + normalizedTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
    }),
    "utf8"
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", normalizedSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validatePaymentResultAccess({ providedToken, orderId, secret, now = Date.now() }) {
  const normalizedToken = normalizeText(providedToken);
  const normalizedOrderId = normalizeText(orderId);
  const normalizedSecret = normalizeText(secret);

  if (!normalizedToken || !normalizedOrderId || !normalizedSecret) {
    return fail("PAYMENT_RESULT_ACCESS_DENIED", "결제 결과 조회 권한이 없거나 만료되었습니다.");
  }

  const [payload, providedSignature, ...extraParts] = normalizedToken.split(".");

  if (!payload || !providedSignature || extraParts.length > 0) {
    return fail("PAYMENT_RESULT_ACCESS_DENIED", "결제 결과 조회 권한이 없거나 만료되었습니다.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", normalizedSecret)
    .update(payload)
    .digest("base64url");
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return fail("PAYMENT_RESULT_ACCESS_DENIED", "결제 결과 조회 권한이 없거나 만료되었습니다.");
  }

  let decoded;

  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (_error) {
    return fail("PAYMENT_RESULT_ACCESS_DENIED", "결제 결과 조회 권한이 없거나 만료되었습니다.");
  }

  if (
    decoded?.v !== 1 ||
    decoded?.oid !== normalizedOrderId ||
    !Number.isInteger(decoded?.exp) ||
    decoded.exp <= Math.floor(now / 1000)
  ) {
    return fail("PAYMENT_RESULT_ACCESS_DENIED", "결제 결과 조회 권한이 없거나 만료되었습니다.");
  }

  return { ok: true };
}

function validateCompletionPaymentBinding({
  draft,
  order,
  payment,
  expectedAmount = null,
}) {
  if (!draft || !order || !payment) {
    return fail("PAYMENT_BINDING_DATA_MISSING", "결제 완료 검증 정보가 누락되었습니다.");
  }

  if (!normalizeText(draft.order_id) || draft.order_id !== order.order_id) {
    return fail("DRAFT_ORDER_MISMATCH", "신청 초안과 결제 주문이 일치하지 않습니다.");
  }

  if (payment.order_id !== order.order_id) {
    return fail("PAYMENT_ORDER_MISMATCH", "결제 내역과 주문이 일치하지 않습니다.");
  }

  if (order.status !== "PAID" || payment.status !== "DONE") {
    return fail("PAYMENT_NOT_COMPLETED", "결제가 완료된 주문이 아닙니다.");
  }

  if (order.payment_provider !== KCP_PROVIDER || payment.payment_provider !== KCP_PROVIDER) {
    return fail("PAYMENT_PROVIDER_MISMATCH", "KCP 결제 주문이 아닙니다.");
  }

  const orderAmount = normalizePositiveInteger(order.amount);
  const paymentAmount = normalizePositiveInteger(payment.total_amount);

  if (orderAmount === null || paymentAmount === null || orderAmount !== paymentAmount) {
    return fail("PAYMENT_AMOUNT_MISMATCH", "주문 금액과 승인 금액이 일치하지 않습니다.");
  }

  if (expectedAmount !== null && normalizePositiveInteger(expectedAmount) !== orderAmount) {
    return fail("DRAFT_AMOUNT_MISMATCH", "신청 금액과 결제 주문 금액이 일치하지 않습니다.");
  }

  if (
    normalizeText(draft.name) !== normalizeText(order.customer_name) ||
    normalizeEmail(draft.email) !== normalizeEmail(order.customer_email)
  ) {
    return fail("ORDER_CUSTOMER_MISMATCH", "신청자와 결제 주문자가 일치하지 않습니다.");
  }

  const draftPaymentMethod = normalizeText(draft.payment_method);
  const orderPaymentMethod = normalizeText(order.payment_method);

  if (!draftPaymentMethod || !orderPaymentMethod || draftPaymentMethod !== orderPaymentMethod) {
    return fail("PAYMENT_METHOD_MISMATCH", "신청 결제수단과 승인 결제수단이 일치하지 않습니다.");
  }

  const paymentKey = normalizeText(payment.payment_key);
  const providerPaymentId = normalizeText(payment.provider_payment_id);

  if (!paymentKey || !providerPaymentId || paymentKey !== providerPaymentId) {
    return fail("PROVIDER_TRANSACTION_MISMATCH", "KCP 거래번호를 검증할 수 없습니다.");
  }

  return {
    ok: true,
    orderAmount,
    paymentKey,
  };
}

function validateExistingPaymentReplay({ order, payment }) {
  if (!order || !payment) {
    return fail("KCP_EXISTING_PAYMENT_MISMATCH", "기존 결제 상태를 확인할 수 없습니다.");
  }

  const paymentKey = normalizeText(payment.payment_key);
  const providerPaymentId = normalizeText(payment.provider_payment_id);
  const orderAmount = normalizePositiveInteger(order.amount);
  const paymentAmount = normalizePositiveInteger(payment.total_amount);

  if (
    order.status !== "PAID" ||
    order.payment_provider !== KCP_PROVIDER ||
    payment.status !== "DONE" ||
    payment.payment_provider !== KCP_PROVIDER ||
    !paymentKey ||
    paymentKey !== providerPaymentId ||
    orderAmount === null ||
    paymentAmount !== orderAmount
  ) {
    return fail(
      "KCP_EXISTING_PAYMENT_MISMATCH",
      "기존 결제 상태가 승인 결과와 일치하지 않습니다."
    );
  }

  return { ok: true, paymentKey, paymentAmount };
}

function validateKcpApprovalResult({
  responseCode,
  approvedOrderId,
  approvedAmount,
  approvedPayType,
  expectedOrderId,
  expectedAmount,
  expectedPayType,
}) {
  if (responseCode !== "0000") {
    return fail("KCP_APPROVE_FAILED", "KCP 결제 승인이 완료되지 않았습니다.");
  }

  if (!normalizeText(approvedOrderId) || approvedOrderId !== expectedOrderId) {
    return fail("KCP_ORDER_ID_MISMATCH", "KCP 승인 주문번호가 서버 주문번호와 일치하지 않습니다.");
  }

  const normalizedApprovedAmount = normalizePositiveInteger(approvedAmount);
  const normalizedExpectedAmount = normalizePositiveInteger(expectedAmount);

  if (
    normalizedApprovedAmount === null ||
    normalizedExpectedAmount === null ||
    normalizedApprovedAmount !== normalizedExpectedAmount
  ) {
    return fail("KCP_AMOUNT_MISMATCH", "KCP 승인 금액이 서버 주문 금액과 일치하지 않습니다.");
  }

  if (!normalizeText(approvedPayType) || approvedPayType !== expectedPayType) {
    return fail("KCP_PAY_TYPE_MISMATCH", "KCP 승인 결제수단이 서버 주문과 일치하지 않습니다.");
  }

  return { ok: true, approvedAmount: normalizedApprovedAmount };
}

function resolveApplicationOrderDetails({ draft, pricing }) {
  if (!draft) {
    return fail("DRAFT_NOT_FOUND", "신청 초안을 찾을 수 없습니다.");
  }

  if (draft.division === "TEST") {
    return fail("TEST_DRAFT_NOT_ALLOWED", "테스트 신청은 전용 결제 경로를 사용해야 합니다.");
  }

  const amount = normalizePositiveInteger(pricing?.amount);
  const customerName = normalizeText(draft.name);
  const customerEmail = normalizeEmail(draft.email);
  const discipline = normalizeText(draft.discipline);

  if (amount === null || !customerName || !customerEmail || !discipline) {
    return fail("ORDER_DETAILS_INVALID", "서버 주문 정보를 확정할 수 없습니다.");
  }

  return {
    ok: true,
    amount,
    customerName,
    customerEmail,
    orderName: `${discipline} 참가 신청`.slice(0, 100),
    paymentProvider: KCP_PROVIDER,
  };
}

function validateKcpTestDraft(draft) {
  if (!draft || draft.division !== "TEST") {
    return fail("KCP_TEST_DRAFT_REQUIRED", "KCP 테스트 전용 신청 초안이 아닙니다.");
  }

  if (normalizeText(draft.order_id)) {
    return fail("KCP_TEST_DRAFT_ALREADY_ORDERED", "이미 테스트 주문이 연결된 신청입니다.");
  }

  const customerName = normalizeText(draft.name);
  const customerEmail = normalizeEmail(draft.email);

  if (!customerName || !customerEmail) {
    return fail("KCP_TEST_CUSTOMER_INVALID", "테스트 신청자 정보를 확인할 수 없습니다.");
  }

  return {
    ok: true,
    customerName,
    customerEmail,
  };
}

module.exports = {
  createDraftAccessToken,
  createPaymentResultAccessToken,
  resolveApplicationOrderDetails,
  validateKcpTestDraft,
  validateKcpApprovalResult,
  validateCompletionPaymentBinding,
  validateDraftAccess,
  validateExistingPaymentReplay,
  validatePaymentResultAccess,
};
