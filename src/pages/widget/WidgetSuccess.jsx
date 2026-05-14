import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { applicationFlowSteps } from "../../lib/applicationFlowAccess";
import { apiFetch, completeApplication } from "../../lib/applicationApi";

export function WidgetSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useApplicationFlow();
  const [message, setMessage] = useState("결제 승인 결과를 확인하고 신청서를 확정하는 중입니다.");

  useEffect(() => {
    async function confirmAndComplete() {
      const requestData = {
        orderId: searchParams.get("orderId"),
        amount: searchParams.get("amount"),
        paymentKey: searchParams.get("paymentKey"),
      };

      const response = await apiFetch("/api/confirm/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw { message: json.message, code: json.code };
      }

      setMessage("결제가 확인되었습니다. 신청 완료 페이지로 이동합니다.");

      const completeResult = await completeApplication({
        draftId: searchParams.get("draftId"),
        orderId: searchParams.get("orderId"),
      });

      dispatch({
        type: "SET_FLOW_STEP",
        value: applicationFlowSteps.COMPLETE,
      });
      navigate(`/apply/complete?applicationNumber=${encodeURIComponent(completeResult.application.applicationNumber)}`);
    }

    confirmAndComplete().catch((error) => {
      navigate(`/fail?code=${error.code || "APPLICATION"}&message=${encodeURIComponent(error.message || "신청 확정에 실패했습니다.")}`);
    });
  }, [dispatch, navigate, searchParams]);

  return (
    <div className="box_section" style={{ width: "600px" }}>
      <img
        width="100px"
        src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png"
        alt="결제 완료"
      />
      <h2>결제를 확인하고 있어요</h2>
      <p className="typography--p" style={{ marginTop: "24px" }}>{message}</p>
      <div className="p-grid typography--p" style={{ marginTop: "40px" }}>
        <div className="p-grid-col text--left"><b>주문번호</b></div>
        <div className="p-grid-col text--right" id="orderId">{searchParams.get("orderId")}</div>
      </div>
    </div>
  );
}
