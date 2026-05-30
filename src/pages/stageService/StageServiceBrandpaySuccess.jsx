import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { apiFetch, completeStageService } from "../../lib/applicationApi";
import { stageServiceFlowSteps } from "../../lib/stageServiceFlowAccess";

export function StageServiceBrandpaySuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useStageServiceFlow();
  const { t } = useLanguage();
  const [responseData, setResponseData] = useState(null);

  useEffect(() => {
    async function confirmAndComplete() {
      const requestData = {
        orderId: searchParams.get("orderId"),
        amount: searchParams.get("amount"),
        paymentKey: searchParams.get("paymentKey"),
        customerKey: searchParams.get("customerKey"),
      };

      const response = await apiFetch("/api/confirm/brandpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw { message: json.message, code: json.code };
      }

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
      return json;
    }

    confirmAndComplete()
      .then((data) => setResponseData(data))
      .catch((error) => {
        navigate(
          `/stage-services/fail?code=${error.code || "STAGE_SERVICE"}&message=${encodeURIComponent(
            error.message || t("brandpay.confirmFailed"),
          )}`,
        );
      });
  }, [dispatch, navigate, searchParams, t]);

  return (
    <>
      <div className="box_section" style={{ width: "600px" }}>
        <img
          width="100px"
          src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png"
          alt={t("brandpay.successAlt")}
        />
        <h2>{t("brandpay.successTitle")}</h2>
        <div className="p-grid typography--p" style={{ marginTop: "50px" }}>
          <div className="p-grid-col text--left"><b>{t("brandpay.orderId")}</b></div>
          <div className="p-grid-col text--right" id="orderId">{searchParams.get("orderId")}</div>
        </div>
        <div className="p-grid-col">
          <Link to="/apply/stage-services/complete">
            <button className="button p-grid-col5">{t("brandpay.completePage")}</button>
          </Link>
        </div>
      </div>
      <div className="box_section" style={{ width: "600px", textAlign: "left" }}>
        <b>{t("common.debugResponseData")}:</b>
        <div id="response" style={{ whiteSpace: "initial" }}>
          {responseData && <pre>{JSON.stringify(responseData, null, 4)}</pre>}
        </div>
      </div>
    </>
  );
}
