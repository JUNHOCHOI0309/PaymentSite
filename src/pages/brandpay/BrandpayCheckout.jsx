import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";

const clientKey = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
const customerKey = generateRandomString();

export function BrandpayCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const [brandpay, setBrandpay] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  useEffect(() => {
    async function fetchBrandpay() {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        const nextBrandpay = tossPayments.brandpay({
          customerKey,
          redirectUrl: "http://localhost:3000/api/callback-auth",
        });

        setBrandpay(nextBrandpay);
      } catch (error) {
        setErrorMessage(error.message || "브랜드페이 준비에 실패했습니다.");
      }
    }

    fetchBrandpay();
  }, []);

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage("주문 정보가 없습니다. review 단계에서 다시 진입해 주세요.");
      return;
    }

    await brandpay.requestPayment({
      amount: {
        currency: "KRW",
        value: 1,
      },
      orderId,
      orderName: "대회 신청 결제",
      successUrl: `${window.location.origin}/brandpay/success?customerKey=${customerKey}&draftId=${encodeURIComponent(draftId || "")}`,
      failUrl: window.location.origin + "/fail",
      customerEmail: state.applicantInfo.email || "customer@example.com",
      customerName: state.applicantInfo.name || "신청자",
    });
  }

  return (
    <div className="wrapper">
      <div className="box_section" style={{ padding: "40px 30px 50px 30px", marginTop: "30px", marginBottom: "50px", display: "flex", flexDirection: "column" }}>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <button className="button" style={{ marginTop: "30px" }} onClick={requestPayment} disabled={!brandpay}>
          결제하기
        </button>
        <button className="button" style={{ marginTop: "30px" }} onClick={() => navigate("/apply/review")}>
          신청 내용 확인으로 돌아가기
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
