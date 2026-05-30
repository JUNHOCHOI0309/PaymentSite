import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { apiFetch, completeStageService } from "../../lib/applicationApi";
import { stageServiceFlowSteps } from "../../lib/stageServiceFlowAccess";

export function StageServiceWidgetSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useStageServiceFlow();
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

      const completeResult = await completeStageService({
        draftId: searchParams.get("draftId"),
        orderId: searchParams.get("orderId"),
      });

      dispatch({
        type: "SET_FLOW_STEP",
        value: stageServiceFlowSteps.COMPLETE,
      });
      navigate(
        `/apply/stage-services/complete?serviceOrderNumber=${encodeURIComponent(
          completeResult.serviceOrder.serviceOrderNumber,
        )}`,
      );
    }

    confirmAndComplete().catch((error) => {
      navigate(
        `/stage-services/fail?code=${error.code || "STAGE_SERVICE"}&message=${encodeURIComponent(
          error.message || t("widget.completeFailed"),
        )}`,
      );
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
