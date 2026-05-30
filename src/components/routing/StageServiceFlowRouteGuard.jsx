import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import {
  hasReachedStageServiceFlowStep,
  hasStageServiceSelection,
} from "../../lib/stageServiceFlowAccess";

export function StageServiceFlowRouteGuard({
  children,
  minStep,
  requireDraftId = false,
  requireOrderId = false,
  requirePaymentMethod,
  requireSearchParams = [],
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, isHydrated } = useStageServiceFlow();

  if (!isHydrated) {
    return null;
  }

  const hasAccess =
    hasStageServiceSelection(state.serviceKey) &&
    (!minStep || hasReachedStageServiceFlowStep(state.flowStep, minStep)) &&
    (!requireDraftId || Boolean(state.draftId)) &&
    (!requireOrderId || Boolean(state.orderId)) &&
    (!requirePaymentMethod || state.paymentMethod === requirePaymentMethod) &&
    requireSearchParams.every((key) => Boolean(searchParams.get(key)));

  if (!hasAccess) {
    return (
      <Navigate
        replace
        to="/apply/stage-services"
        state={{ from: `${location.pathname}${location.search}`, source: "guard" }}
      />
    );
  }

  return children;
}
