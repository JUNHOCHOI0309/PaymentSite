import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSpectatorFlow } from "../../context/SpectatorFlowContext";
import { ApplicationFlowStepper } from "../../components/common/ApplicationFlowStepper";
import { prepareKcpPayment } from "../../lib/applicationApi";

export function SpectatorPaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useSpectatorFlow();
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");
  const [isOrderUnavailable, setIsOrderUnavailable] = useState(false);
  const draftId = searchParams.get("draftId") || state.draftId;
  const orderId = searchParams.get("orderId") || state.orderId;

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage("결제 주문 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      setErrorMessage("");
      const payment = await prepareKcpPayment({ context: "spectator", draftId, orderId, paymentMethod });
      const form = document.createElement("form");
      form.method = "post";
      form.action = payment.payUrl;
      Object.entries(payment.formFields || {}).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      const orderUnavailable = ["PAYMENT_ORDER_EXPIRED", "PAYMENT_ORDER_CANCELED"].includes(error.code);
      setIsOrderUnavailable(orderUnavailable);
      setErrorMessage(
        orderUnavailable
          ? "결제 주문이 만료되었거나 취소되었습니다. 신청 내용 확인으로 돌아가 새 주문을 생성해 주세요."
          : error.message || "결제를 준비하지 못했습니다."
      );
    }
  }

  return (
    <main className="site-kcp-checkout">
      <div className="site-kcp-checkout__content">
        <ApplicationFlowStepper currentStep={4} type="spectator" variant="dark" />
        <section className="site-kcp-checkout__panel">
        <p className="site-kicker">SECURE PAYMENT</p>
        <h1>참관객 입장권</h1>
        <p className="site-kcp-checkout__amount">15,000원</p>
        <p className="site-kcp-checkout__description">결제수단을 선택한 뒤 KCP 결제창에서 결제를 완료해 주세요.</p>
        {errorMessage ? <p className="site-kcp-checkout__error">{errorMessage}</p> : null}

        <div className="site-kcp-checkout__methods" role="radiogroup" aria-label="결제수단">
          {[["CARD", "카드", "▣"], ["TRANSFER", "계좌이체", "₩"]].map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              className={`site-kcp-checkout__method ${paymentMethod === value ? "is-selected" : ""}`}
              aria-checked={paymentMethod === value}
              role="radio"
              onClick={() => setPaymentMethod(value)}
            >
              <span className="site-kcp-checkout__method-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <p className="site-kcp-checkout__terms">결제 진행 시 참관객 신청 및 환불 규정에 동의한 것으로 간주합니다.</p>
        <button className="site-kcp-checkout__submit" type="button" disabled={!orderId || isOrderUnavailable} onClick={requestPayment}>15,000원 결제하기</button>
        <button className="site-kcp-checkout__back" type="button" onClick={() => navigate("/apply/spectator/review")}>신청 내용으로 돌아가기</button>
        </section>
      </div>
    </main>
  );
}
