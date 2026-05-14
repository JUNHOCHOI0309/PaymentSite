import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import {
  hasApplicationSelection,
  hasReachedFlowStep,
} from "../../lib/applicationFlowAccess";

export function ApplicationFlowRouteGuard({
  children,
  minStep,
  requireDraftId = false,
  requireOrderId = false,
  requirePaymentMethod,
  requireSearchParams = [],
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, isHydrated } = useApplicationFlow();

  if (!isHydrated) {
    return null;
  }

  const hasAccess =
    hasApplicationSelection(state.selection) &&
    (!minStep || hasReachedFlowStep(state.flowStep, minStep)) &&
    (!requireDraftId || Boolean(state.draftId)) &&
    (!requireOrderId || Boolean(state.orderId)) &&
    (!requirePaymentMethod || state.paymentMethod === requirePaymentMethod) &&
    requireSearchParams.every((key) => Boolean(searchParams.get(key)));

  if (!hasAccess) {
    return (
      <Navigate
        replace
        to="/apply"
        state={{ from: `${location.pathname}${location.search}`, source: "guard" }}
      />
    );
  }

  return children;
}
