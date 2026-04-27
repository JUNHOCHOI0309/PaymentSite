import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";

const clientKey = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
const customerKey = generateRandomString();
const amount = { currency: "KRW", value: 1 };

export function PaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const [payment, setPayment] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  useEffect(() => {
    async function fetchPayment() {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        setPayment(tossPayments.payment({ customerKey }));
      } catch (error) {
        setErrorMessage(error.message || "결제창 준비에 실패했습니다.");
      }
    }

    fetchPayment();
  }, []);

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage("주문 정보가 없습니다. review 단계에서 다시 진입해 주세요.");
      return;
    }

    await payment.requestPayment({
      method: selectedPaymentMethod,
      amount,
      orderId,
      orderName: "대회 신청 결제",
      successUrl: `${window.location.origin}/payment/success?draftId=${encodeURIComponent(draftId || "")}`,
      failUrl: window.location.origin + "/fail",
      customerEmail: state.applicantInfo.email || "customer@example.com",
      customerName: state.applicantInfo.name || "신청자",
    });
  }

  return (
    <div className="wrapper">
      <div className="box_section">
        <h1>일반 결제</h1>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="payment-method" style={{ display: "flex", flexWrap: "wrap" }}>
          {[
            ["CARD", "카드"],
            ["TRANSFER", "계좌이체"],
            ["VIRTUAL_ACCOUNT", "가상계좌"],
            ["MOBILE_PHONE", "휴대폰"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`button2 ${selectedPaymentMethod === value ? "active" : ""}`}
              onClick={() => setSelectedPaymentMethod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="button" onClick={() => requestPayment()} disabled={!payment}>
          결제하기
        </button>
      </div>
      <div className="box_section" style={{ padding: "32px" }}>
        <button className="button" style={{ marginTop: "0" }} onClick={() => navigate("/apply/review")}>
          신청 내용 확인으로 돌아가기
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
