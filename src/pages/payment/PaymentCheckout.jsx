import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";
import { ApplicationFlowStepper } from "../../components/common/ApplicationFlowStepper";
import { formatApplicationEntryFee, getApplicationEntryFeePricing } from "../../data/applicationEntryFees";
import { prepareKcpPayment } from "../../lib/applicationApi";

export function PaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");
  const [isOrderUnavailable, setIsOrderUnavailable] = useState(false);

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;
  const paymentPricing = getApplicationEntryFeePricing(
    state.selection.imageKey,
    state.applicantInfo.weightClass,
  );
  async function requestPayment() {
    if (!orderId) {
      setErrorMessage(t("payment.missingOrder"));
      return;
    }

    try {
      setErrorMessage("");
      const kcpPayment = await prepareKcpPayment({
        context: "application",
        draftId,
        orderId,
        paymentMethod: selectedPaymentMethod,
      });

      if (
        kcpPayment.priceChanged &&
        !window.confirm(`참가비가 현재 접수 기간 기준으로 ${Number(kcpPayment.amount || 0).toLocaleString("ko-KR")}원으로 변경되었습니다. 이 금액으로 결제를 진행할까요?`)
      ) {
        return;
      }

      submitKcpPayment(kcpPayment.payUrl, kcpPayment.formFields);
    } catch (error) {
      const orderUnavailable = ["PAYMENT_ORDER_EXPIRED", "PAYMENT_ORDER_CANCELED"].includes(error.code);
      setIsOrderUnavailable(orderUnavailable);
      setErrorMessage(
        orderUnavailable
          ? "결제 주문이 만료되었거나 취소되었습니다. 신청 내용 확인으로 돌아가 새 주문을 생성해 주세요."
          : error.message || t("payment.prepareError")
      );
    }
  }

  return (
    <main className="site-kcp-checkout">
      <div className="site-kcp-checkout__content">
        <ApplicationFlowStepper currentStep={4} type="application" variant="dark" />
        <section className="site-kcp-checkout__panel">
        <p className="site-kicker">SECURE PAYMENT</p>
        <h1>{t("payment.title")}</h1>
        <p className="site-kcp-checkout__amount">{formatApplicationEntryFee(paymentPricing.amount, locale)}</p>
        <p className="site-kcp-checkout__description">결제수단을 선택한 뒤 KCP 결제창에서 결제를 완료해 주세요.</p>
        {errorMessage ? <p className="site-kcp-checkout__error">{errorMessage}</p> : null}

        <div className="site-kcp-checkout__methods" role="radiogroup" aria-label={t("payment.title")}>
          {[
            ["CARD", t("payment.card"), "▣"],
            ["TRANSFER", t("payment.transfer"), "₩"],
          ].map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              className={`site-kcp-checkout__method ${selectedPaymentMethod === value ? "is-selected" : ""}`}
              aria-checked={selectedPaymentMethod === value}
              role="radio"
              onClick={() => setSelectedPaymentMethod(value)}
            >
              <span className="site-kcp-checkout__method-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <p className="site-kcp-checkout__terms">결제 진행 시 참가 신청 및 환불 규정에 동의한 것으로 간주합니다.</p>
        <button className="site-kcp-checkout__submit" type="button" onClick={requestPayment} disabled={!orderId || isOrderUnavailable}>
          {locale === "ko" ? `${formatApplicationEntryFee(paymentPricing.amount, locale)} 결제하기` : t("payment.pay")}
        </button>
        <button className="site-kcp-checkout__back" type="button" onClick={() => navigate("/apply/review")}>
          {t("payment.backToReview")}
        </button>
        </section>
      </div>
    </main>
  );
}

function submitKcpPayment(payUrl, formFields = {}) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = payUrl;

  Object.entries(formFields).forEach(([name, value]) => {
    if (value == null) {
      return;
    }

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
