import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  cancelPendingApplicationOrder,
  cancelPendingSpectatorOrder,
  cancelPendingStageServiceOrder,
} from "../lib/applicationApi";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import { buildApplyDetailPath } from "../lib/applicationFlowRoutes";
import { buildStageServiceDetailPath } from "../lib/stageServiceFlowRoutes";
import { stageServiceFlowSteps } from "../lib/stageServiceFlowAccess";
import { useSpectatorFlow, spectatorFlowSteps } from "../context/SpectatorFlowContext";

export function FailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { state: applicationState, dispatch: applicationDispatch } = useApplicationFlow();
  const { state: stageServiceState, dispatch: stageServiceDispatch } = useStageServiceFlow();
  const { state: spectatorState, dispatch: spectatorDispatch } = useSpectatorFlow();
  const [isMoving, setIsMoving] = useState(false);
  const [actionError, setActionError] = useState("");
  const isStageService = location.pathname.startsWith("/stage-services/");
  const isSpectator = location.pathname.startsWith("/spectators/");
  const failureTitle = isStageService
    ? "무대 서비스 결제를 완료하지 못했습니다"
    : isSpectator
      ? "참관객 결제를 완료하지 못했습니다"
      : "결제를 완료하지 못했습니다";
  const failureDescription = isStageService
    ? "결제가 취소되었거나 승인 과정에서 중단되었습니다. 신청 내용을 수정하거나 현재 내용으로 다시 결제할 수 있습니다."
    : isSpectator
      ? "결제가 취소되었거나 승인 과정에서 중단되었습니다. 신청 내용을 수정하거나 현재 내용으로 다시 결제할 수 있습니다."
      : "결제가 취소되었거나 승인 과정에서 중단되었습니다. 신청 내용을 수정하거나 현재 내용으로 다시 결제할 수 있습니다.";
  const failureMessage = searchParams.get("message") || "결제가 취소되었습니다.";
  const failureCode = searchParams.get("code") || "-";
  const orderId = searchParams.get("orderId") || (isStageService
    ? stageServiceState.orderId
    : isSpectator
      ? spectatorState.orderId
      : applicationState.orderId);
  const draftId = searchParams.get("draftId") || (isStageService
    ? stageServiceState.draftId
    : isSpectator
      ? spectatorState.draftId
      : applicationState.draftId);

  async function releasePendingOrder() {
    if (!orderId || !draftId) {
      return;
    }

    try {
      if (isStageService) {
        await cancelPendingStageServiceOrder(orderId, { draftId });
      } else if (isSpectator) {
        await cancelPendingSpectatorOrder(orderId, { draftId });
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
            ? buildStageServiceDetailPath({
              serviceKey: stageServiceState.serviceKey,
              name: stageServiceState.applicantInfo.name,
              email: stageServiceState.applicantInfo.email,
              phone: stageServiceState.applicantInfo.phone,
            })
            : "/apply/stage-services/review",
          destination === "edit" ? { state: { source: "review" } } : undefined,
        );
        return;
      }

      if (isSpectator) {
        spectatorDispatch({ type: "SET_ORDER", payload: { orderId: null } });
        spectatorDispatch({
          type: "SET_FLOW_STEP",
          value: destination === "edit" ? spectatorFlowSteps.CONSENT : spectatorFlowSteps.REVIEW,
        });
        navigate(destination === "edit" ? "/apply/spectator" : "/apply/spectator/review");
        return;
      }

      applicationDispatch({ type: "SET_ORDER", payload: { orderId: null } });
      applicationDispatch({
        type: "SET_FLOW_STEP",
        value: destination === "edit" ? applicationFlowSteps.CONSENT : applicationFlowSteps.REVIEW,
      });
      navigate(
        destination === "edit"
          ? buildApplyDetailPath(applicationState.selection)
          : "/apply/review",
        destination === "edit" ? { state: { source: "review" } } : undefined,
      );
    } catch (error) {
      setActionError(error.message || "결제 주문을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsMoving(false);
    }
  }

  return (
    <main className="site-kcp-checkout site-kcp-failure">
      <section className="site-kcp-checkout__panel">
        <p className="site-kicker">PAYMENT CANCELED</p>
        <h1>{failureTitle}</h1>
        <p className="site-kcp-checkout__description">{failureDescription}</p>

        <dl className="site-kcp-failure__details">
          <div>
            <dt>{t("fail.message")}</dt>
            <dd>{failureMessage}</dd>
          </div>
          <div>
            <dt>{t("fail.code")}</dt>
            <dd>{failureCode}</dd>
          </div>
        </dl>

        {actionError ? <p className="site-kcp-checkout__error">{actionError}</p> : null}
        <div className="site-kcp-failure__actions">
          <button
            className="site-kcp-checkout__back"
            type="button"
            disabled={isMoving}
            onClick={() => moveAfterCancellation("edit")}
          >
            신청 내용 수정
          </button>
          <button
            className="site-kcp-checkout__submit"
            type="button"
            disabled={isMoving}
            onClick={() => moveAfterCancellation("retry")}
          >
            다시 결제하기
          </button>
        </div>
      </section>
    </main>
  );
}
