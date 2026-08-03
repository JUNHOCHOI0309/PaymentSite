import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { formatStageServiceAmount, getStageServiceTitle } from "../../data/stageServiceConfig";
import { prepareKcpPayment } from "../../lib/applicationApi";

export function StageServicePaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useStageServiceFlow();
  const { locale, t } = useLanguage();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage(t("payment.missingOrder"));
      return;
    }

    try {
      const kcpPayment = await prepareKcpPayment({
        context: "stageService",
        draftId,
        orderId,
        paymentMethod: selectedPaymentMethod,
      });

      if (
        kcpPayment.priceChanged &&
        !window.confirm(`결제 금액이 ${Number(kcpPayment.amount || 0).toLocaleString("ko-KR")}원으로 변경되었습니다. 이 금액으로 결제를 진행할까요?`)
      ) {
        return;
      }

      submitKcpPayment(kcpPayment.payUrl, kcpPayment.formFields);
    } catch (error) {
      setErrorMessage(error.message || t("payment.prepareError"));
    }
  }

  return (
    <main className="site-kcp-checkout">
      <section className="site-kcp-checkout__panel">
        <p className="site-kicker">SECURE PAYMENT</p>
        <h1>{getStageServiceTitle(state.serviceKey, locale)}</h1>
        <p className="site-kcp-checkout__amount">{formatStageServiceAmount(state.totalAmount, locale)}</p>
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

        <button className="site-kcp-checkout__submit" type="button" onClick={requestPayment} disabled={!orderId}>
          {t("payment.pay")}
        </button>
        <button className="site-kcp-checkout__back" type="button" onClick={() => navigate("/apply/stage-services/review")}>
          {t("payment.backToReview")}
        </button>
      </section>
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
