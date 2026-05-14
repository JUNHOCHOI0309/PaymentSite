import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";
import { applicationFlowSteps } from "../../lib/applicationFlowAccess";
import { apiFetch, completeApplication } from "../../lib/applicationApi";

export function WidgetSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useApplicationFlow();
  const { t } = useLanguage();
  const [message, setMessage] = useState(t("widget.successPending"));

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

      setMessage(t("widget.successConfirmed"));

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
      navigate(`/fail?code=${error.code || "APPLICATION"}&message=${encodeURIComponent(error.message || t("widget.completeFailed"))}`);
    });
  }, [dispatch, navigate, searchParams, t]);

  return (
    <div className="box_section" style={{ width: "600px" }}>
      <img
        width="100px"
        src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png"
        alt={t("widget.successAlt")}
      />
      <h2>{t("widget.successTitle")}</h2>
      <p className="typography--p" style={{ marginTop: "24px" }}>{message}</p>
      <div className="p-grid typography--p" style={{ marginTop: "40px" }}>
        <div className="p-grid-col text--left"><b>{t("widget.orderId")}</b></div>
        <div className="p-grid-col text--right" id="orderId">{searchParams.get("orderId")}</div>
      </div>
    </div>
  );
}
