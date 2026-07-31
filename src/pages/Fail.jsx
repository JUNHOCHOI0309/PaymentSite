import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  cancelPendingApplicationOrder,
  cancelPendingStageServiceOrder,
} from "../lib/applicationApi";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import { buildStageServiceDetailPath } from "../lib/stageServiceFlowRoutes";
import { stageServiceFlowSteps } from "../lib/stageServiceFlowAccess";

export function FailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { state: applicationState, dispatch: applicationDispatch } = useApplicationFlow();
  const { state: stageServiceState, dispatch: stageServiceDispatch } = useStageServiceFlow();
  const [isMoving, setIsMoving] = useState(false);
  const [actionError, setActionError] = useState("");
  const isStageService = location.pathname.startsWith("/stage-services/");
  const orderId = searchParams.get("orderId") || (isStageService ? stageServiceState.orderId : applicationState.orderId);
  const draftId = searchParams.get("draftId") || (isStageService ? stageServiceState.draftId : applicationState.draftId);

  async function releasePendingOrder() {
    if (!orderId || !draftId) {
      return;
    }

    try {
      if (isStageService) {
        await cancelPendingStageServiceOrder(orderId, { draftId });
      } else {
        await cancelPendingApplicationOrder(orderId, { draftId });
      }
    } catch (error) {
      // KCP 취소 콜백에서 이미 주문을 해제한 경우에도 사용자는 수정·재시도를 계속할 수 있다.
      if (error.code === "PAYMENT_ALREADY_COMPLETED") {
        throw error;
      }
    }
  }

  async function moveAfterCancellation(destination) {
    setIsMoving(true);
    setActionError("");

    try {
      await releasePendingOrder();

      if (isStageService) {
        stageServiceDispatch({ type: "SET_ORDER", payload: { orderId: null } });
        stageServiceDispatch({ type: "SET_FLOW_STEP", value: stageServiceFlowSteps.REVIEW });
        navigate(
          destination === "edit"
            ? buildStageServiceDetailPath(stageServiceState.serviceKey)
            : "/apply/stage-services/review",
          destination === "edit" ? { state: { source: "review" } } : undefined,
        );
        return;
      }

      applicationDispatch({ type: "SET_ORDER", payload: { orderId: null } });
      applicationDispatch({
        type: "SET_FLOW_STEP",
        value: destination === "edit" ? applicationFlowSteps.CONSENT : applicationFlowSteps.REVIEW,
      });
      navigate(destination === "edit" ? "/apply/detail" : "/apply/review");
    } catch (error) {
      setActionError(error.message || "결제 주문을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsMoving(false);
    }
  }

  return (
    <div id="info" className="box_section" style={{ width: "600px" }}>
      <h2>{t("fail.title")}</h2>

      <div className="p-grid typography--p" style={{ marginTop: "50px" }}>
        <div className="p-grid-col text--left">
          <b>{t("fail.message")}</b>
        </div>
        <div className="p-grid-col text--right" id="message">
          {searchParams.get("message") || "결제가 취소되었습니다."}
        </div>
      </div>
      <div className="p-grid typography--p" style={{ marginTop: "10px" }}>
        <div className="p-grid-col text--left">
          <b>{t("fail.code")}</b>
        </div>
        <div className="p-grid-col text--right" id="code">
          {searchParams.get("code") || "-"}
        </div>
      </div>
      <p style={{ marginTop: "24px" }}>
        결제 취소 후 신청 내용을 수정하거나, 현재 내용으로 다시 결제를 시도할 수 있습니다.
      </p>
      {actionError ? <p style={{ color: "#d14343" }}>{actionError}</p> : null}
      <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
        <button className="button2" disabled={isMoving} onClick={() => moveAfterCancellation("edit")}>
          신청 내용 수정
        </button>
        <button className="button" disabled={isMoving} onClick={() => moveAfterCancellation("retry")}>
          다시 결제하기
        </button>
      </div>
    </div>
  );
}
