import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { ApplicationFlowStepper, ApplicationReviewSection } from "../components/common/ApplicationFlowStepper";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useSpectatorFlow, spectatorFlowSteps } from "../context/SpectatorFlowContext";
import { createSpectatorOrder, getSpectatorDraft } from "../lib/applicationApi";

const previewSpectatorDraft = {
  name: "홍길동",
  phone: "010-1234-5678",
  email: "preview@mmkorea.com",
  totalAmount: 15000,
};

export function SpectatorReviewPage({ preview = false }) {
  const navigate = useNavigate();
  const { state, dispatch } = useSpectatorFlow();
  const [draft, setDraft] = useState(() => preview ? previewSpectatorDraft : null);
  const [errorMessage, setErrorMessage] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    if (preview) {
      return;
    }

    getSpectatorDraft(state.draftId)
      .then((response) => setDraft(response.draft))
      .catch((error) => setErrorMessage(error.message || "신청 내용을 불러오지 못했습니다."));
  }, [preview, state.draftId]);

  async function prepareOrder({ replacePendingOrder = false } = {}) {
    if (preview) {
      return { orderId: "order_preview_spectator", status: "READY", replacePendingOrder };
    }

    if (!state.draftId) {
      navigate("/apply/spectator");
      return null;
    }

    const response = await createSpectatorOrder({
      draftId: state.draftId,
      replacePendingOrder,
    });
    const order = response.order;
    dispatch({ type: "SET_ORDER", payload: { orderId: order.orderId } });
    return order;
  }

  async function handleCreateOrder() {
    setIsPreparing(true);
    setErrorMessage("");
    setOrderMessage("");
    try {
      const order = await prepareOrder({ replacePendingOrder: true });
      if (!order) return;

      if (order.status !== "READY") {
        setErrorMessage("완료되었거나 처리 중인 주문이 있습니다. 신청 조회에서 결제 상태를 확인해 주세요.");
        return;
      }

      setOrderMessage(
        order.orderId === state.orderId
          ? "현재 유효한 결제 주문이 있습니다. 결제 진행을 눌러 결제를 계속해 주세요."
          : "새 결제 주문이 생성되었습니다. 20분 안에 결제를 진행해 주세요."
      );
    } catch (error) {
      setErrorMessage(error.message || "결제 주문을 생성하지 못했습니다.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function handlePayment() {
    if (preview) {
      navigate("/preview/spectator/complete");
      return;
    }

    setIsPreparing(true);
    setErrorMessage("");
    setOrderMessage("");
    try {
      const order = await prepareOrder();
      if (!order) return;

      if (order.status !== "READY") {
        setErrorMessage("완료되었거나 처리 중인 주문이 있습니다. 신청 조회에서 결제 상태를 확인해 주세요.");
        return;
      }

      dispatch({ type: "SET_FLOW_STEP", value: spectatorFlowSteps.CHECKOUT });
      navigate(`/spectators/payment/checkout?draftId=${encodeURIComponent(state.draftId)}&orderId=${encodeURIComponent(order.orderId)}`);
    } catch (error) {
      setErrorMessage(error.message || "결제 주문을 생성하지 못했습니다.");
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <ApplicationFlowStepper currentStep={3} type="spectator" />
        <div className="site-review-card site-spectator-review">
          <div className="site-review-card__header"><p className="site-kicker">REVIEW</p><h1>참관객 신청 내용 확인</h1><p>입력한 정보와 결제 금액을 확인해 주세요.</p></div>
          <div className="site-flow-review">
            <ApplicationReviewSection title="신청자 정보">
              <div className="site-review-row"><span>성함</span><strong>{draft?.name || state.applicant.name}</strong></div>
              <div className="site-review-row"><span>연락처</span><strong>{draft?.phone || state.applicant.phone}</strong></div>
              <div className="site-review-row"><span>이메일</span><strong>{draft?.email || state.applicant.email}</strong></div>
            </ApplicationReviewSection>
            <ApplicationReviewSection title="입장권 정보">
              <div className="site-review-row"><span>입장권 수량</span><strong>1매</strong></div>
            </ApplicationReviewSection>
            <section className="site-flow-review__payment">
              <h2>결제 예정 금액</h2>
              <div className="site-review-row"><span>총 결제금액</span><strong>{Number(draft?.totalAmount || state.amount).toLocaleString("ko-KR")}원</strong></div>
            </section>
          </div>
          <NoticeBox title="결제 전 확인"><ul className="site-list"><li>동일한 성함, 연락처, 이메일로 입장권은 1매만 구매할 수 있습니다.</li><li>결제 완료 후 신청 조회에서 신청번호를 확인할 수 있습니다.</li><li>입장 시 신청번호와 성함을 확인합니다.</li></ul></NoticeBox>
          <div className="site-review-order-actions site-flow-actions">
            <Button variant="ghost" onClick={handleCreateOrder} disabled={isPreparing}>{isPreparing ? "준비 중" : "새 주문 생성하기"}</Button>
            <div className="site-review-order-actions__primary">
              <Button variant="ghost" onClick={() => navigate(preview ? "/preview/spectator/consent" : "/apply/spectator/consent")}>이전</Button>
              <Button disabled={isPreparing} onClick={handlePayment}>{isPreparing ? "준비 중" : "결제 단계로 계속"}</Button>
            </div>
          </div>
          {orderMessage ? <p className="site-review-order-message">{orderMessage}</p> : null}
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
