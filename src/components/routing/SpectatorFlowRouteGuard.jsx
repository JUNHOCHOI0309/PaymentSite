import { Navigate, useLocation } from "react-router-dom";
import {
  hasReachedSpectatorFlowStep,
  useSpectatorFlow,
} from "../../context/SpectatorFlowContext";

export function SpectatorFlowRouteGuard({
  children,
  minStep,
  requireDraftId = false,
  requireOrderId = false,
  requireSearchParams = [],
}) {
  const location = useLocation();
  const { state, isHydrated } = useSpectatorFlow();

  if (!isHydrated) return null;

  const hasAccess =
    (!minStep || hasReachedSpectatorFlowStep(state.flowStep, minStep)) &&
    (!requireDraftId || Boolean(state.draftId)) &&
    (!requireOrderId || Boolean(state.orderId)) &&
    requireSearchParams.every((key) => Boolean(searchParams.get(key)));

  if (!hasAccess) {
    return (
      <Navigate
        replace
        to="/apply/spectator"
        state={{ from: `${location.pathname}${location.search}`, source: "guard" }}
      />
    );
  }

  return children;
}
