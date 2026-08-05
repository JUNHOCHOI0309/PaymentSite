const refundInProgressStatuses = new Set(["REQUESTED", "PROCESSING", "SYNC_FAILED"]);
const refundedPaymentStatuses = new Set(["CANCELED", "PARTIAL_CANCELED"]);
const refundedOperationalStatuses = new Set(["REFUNDED", "PARTIAL_REFUNDED"]);

export function getCustomerPaymentStatus({
  paymentStatus,
  refundRequestStatus,
  operationalStatus,
  locale = "ko",
} = {}) {
  const normalizedPaymentStatus = String(paymentStatus || "").trim().toUpperCase();
  const normalizedRefundRequestStatus = String(refundRequestStatus || "").trim().toUpperCase();
  const normalizedOperationalStatus = String(operationalStatus || "").trim().toUpperCase();
  const isKorean = locale === "ko";

  if (refundInProgressStatuses.has(normalizedRefundRequestStatus)) {
    return isKorean ? "환불 진행 중" : "Refund in progress";
  }

  if (
    refundedPaymentStatuses.has(normalizedPaymentStatus) ||
    refundedOperationalStatuses.has(normalizedOperationalStatus) ||
    normalizedRefundRequestStatus === "COMPLETED"
  ) {
    return isKorean ? "환불 완료됨" : "Refund completed";
  }

  if (normalizedPaymentStatus === "DONE") {
    return isKorean ? "결제됨" : "Payment completed";
  }

  return isKorean ? "결제 처리 중" : "Payment processing";
}
