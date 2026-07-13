import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";
import { applicationFlowSteps } from "../../lib/applicationFlowAccess";
import { completeApplication } from "../../lib/applicationApi";

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useApplicationFlow();
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

    confirmAndComplete()
      .catch((error) => {
        navigate(`/fail?code=${error.code || "APPLICATION"}&message=${encodeURIComponent(error.message || t("payment.confirmFailed"))}`);
      });
  }, [dispatch, navigate, searchParams, t]);

  return <div className="box_section"><h2>{t("payment.successTitle")}</h2></div>;
}
