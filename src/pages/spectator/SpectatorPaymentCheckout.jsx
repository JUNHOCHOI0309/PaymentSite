import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSpectatorFlow } from "../../context/SpectatorFlowContext";
import { prepareKcpPayment } from "../../lib/applicationApi";

export function SpectatorPaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useSpectatorFlow();
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");
  const draftId = searchParams.get("draftId") || state.draftId;
  const orderId = searchParams.get("orderId") || state.orderId;

  async function requestPayment() {
    try {
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
      setErrorMessage(error.message || "결제를 준비하지 못했습니다.");
    }
  }

  return (
    <div className="wrapper">
      <div className="box_section">
        <h1>참관객 입장권</h1><p>15,000원</p>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="payment-method" style={{ display: "flex", flexWrap: "wrap" }}>
          {[["CARD", "카드"], ["TRANSFER", "계좌이체"], ["MOBILE_PHONE", "휴대폰"]].map(([value, label]) => <button key={value} className={`button2 ${paymentMethod === value ? "active" : ""}`} onClick={() => setPaymentMethod(value)}>{label}</button>)}
        </div>
        <button className="button" disabled={!orderId} onClick={requestPayment}>결제하기</button>
      </div>
      <div className="box_section" style={{ padding: 32 }}><button className="button" style={{ marginTop: 0 }} onClick={() => navigate("/apply/spectator/review")}>신청 내용으로 돌아가기</button></div>
    </div>
  );
}
