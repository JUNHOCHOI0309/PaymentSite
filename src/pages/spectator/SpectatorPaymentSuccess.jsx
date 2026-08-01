import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSpectatorFlow, spectatorFlowSteps } from "../../context/SpectatorFlowContext";
import { completeSpectatorOrder } from "../../lib/applicationApi";

export function SpectatorPaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dispatch } = useSpectatorFlow();

  useEffect(() => {
    if (searchParams.get("provider") !== "kcp" || searchParams.get("confirmed") !== "1") {
      navigate("/spectators/fail?message=결제 승인 정보를 확인할 수 없습니다.", { replace: true });
      return;
    }
    completeSpectatorOrder({ draftId: searchParams.get("draftId"), orderId: searchParams.get("orderId") })
      .then((response) => {
        dispatch({ type: "SET_FLOW_STEP", value: spectatorFlowSteps.COMPLETE });
        navigate(`/apply/spectator/complete?spectatorOrderNumber=${encodeURIComponent(response.spectatorOrder.spectatorOrderNumber)}`, { replace: true });
      })
      .catch((error) => navigate(`/spectators/fail?message=${encodeURIComponent(error.message || "결제 완료 처리에 실패했습니다.")}`, { replace: true }));
  }, [dispatch, navigate, searchParams]);

  return <div className="box_section"><h2>결제 완료를 처리하고 있습니다.</h2></div>;
}
