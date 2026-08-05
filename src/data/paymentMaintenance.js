import paymentMaintenance from "./paymentMaintenance.json";

export function getPaymentMaintenanceNotice(locale = "ko") {
  if (locale === "ko") {
    return `매일 ${paymentMaintenance.start}~${paymentMaintenance.end}에는 카드사 점검으로 결제를 이용할 수 없습니다. ${paymentMaintenance.resume} 이후 다시 시도해 주세요.`;
  }

  return `Payments are unavailable daily from ${paymentMaintenance.start} to ${paymentMaintenance.end} (KST) due to card issuer maintenance. Please try again after ${paymentMaintenance.resume}.`;
}

export { paymentMaintenance };
