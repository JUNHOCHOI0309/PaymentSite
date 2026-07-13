import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { completeStageService } from "../../lib/applicationApi";
import { stageServiceFlowSteps } from "../../lib/stageServiceFlowAccess";

export function StageServicePaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useStageServiceFlow();
  const { t } = useLanguage();
  useEffect(() => {
    async function confirmAndComplete() {
      const isKcpConfirmed =
        searchParams.get("provider") === "kcp" && searchParams.get("confirmed") === "1";

      if (!isKcpConfirmed) {
        throw {
          code: "KCP_CONFIRMATION_REQUIRED",
          message: t("payment.confirmFailed"),
        };
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
    }

    confirmAndComplete()
      .catch((error) => {
        navigate(
          `/stage-services/fail?code=${error.code || "STAGE_SERVICE"}&message=${encodeURIComponent(
            error.message || t("payment.confirmFailed"),
          )}`,
        );
      });
  }, [dispatch, navigate, searchParams, t]);

  return <div className="box_section"><h2>{t("payment.successTitle")}</h2></div>;
}
