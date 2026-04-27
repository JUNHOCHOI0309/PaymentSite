import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";

const clientKey = import.meta.env.VITE_TOSS_WIDGET_CLIENT_KEY;
const customerKey = generateRandomString();

if (!clientKey) {
  throw new Error("VITE_TOSS_WIDGET_CLIENT_KEY is not set");
}

export function WidgetCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();

  const [order, setOrder] = useState(null);
  const [amount, setAmount] = useState({ currency: "KRW", value: 1 });
  const [ready, setReady] = useState(false);
  const [widgets, setWidgets] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function initializeOrderAndWidgets() {
      try {
        const queryOrderId = searchParams.get("orderId");
        const draftId = searchParams.get("draftId") || state.draftId;
        const resolvedOrder = {
          orderId: queryOrderId || state.orderId,
          orderName: "참가 신청 결제",
          amount: 1,
          customerEmail: state.applicantInfo.email,
          customerName: state.applicantInfo.name,
          draftId,
        };

        if (!resolvedOrder.orderId) {
          throw new Error("결제에 사용할 주문 정보가 없습니다. 신청 내용 확인 단계에서 다시 진입해 주세요.");
        }

        setOrder(resolvedOrder);
        setAmount({ currency: "KRW", value: resolvedOrder.amount });

        const tossPayments = await loadTossPayments(clientKey);
        const nextWidgets = tossPayments.widgets({ customerKey });
        setWidgets(nextWidgets);
      } catch (error) {
        setErrorMessage(error.message || "결제 위젯 준비에 실패했습니다.");
      }
    }

    initializeOrderAndWidgets();
  }, [searchParams, state]);

  useEffect(() => {
    async function renderPaymentWidgets() {
      if (!widgets || !order) {
        return;
      }

      await widgets.setAmount(amount);
      await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#payment-method",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#agreement",
          variantKey: "AGREEMENT",
        }),
      ]);

      setReady(true);
    }

    renderPaymentWidgets().catch((error) => {
      setErrorMessage(error.message || "결제 위젯 렌더링에 실패했습니다.");
    });
  }, [widgets, order, amount]);

  return (
    <div className="wrapper">
      <div className="box_section">
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="payment-method" />
        <div id="agreement" />
        <button
          className="button"
          style={{ marginTop: "30px" }}
          disabled={!ready || !order}
          onClick={async () => {
            try {
              await widgets.requestPayment({
                orderId: order.orderId,
                orderName: order.orderName,
                successUrl: `${window.location.origin}/widget/success?draftId=${encodeURIComponent(order.draftId || "")}`,
                failUrl: window.location.origin + "/fail",
                customerEmail: order.customerEmail || undefined,
                customerName: order.customerName || undefined,
              });
            } catch (error) {
              setErrorMessage(error.message || "결제 요청에 실패했습니다.");
            }
          }}
        >
          결제 진행하기
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
