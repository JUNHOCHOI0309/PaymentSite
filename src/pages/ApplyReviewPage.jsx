import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import { buildApplyDetailPath } from "../lib/applicationFlowRoutes";
import { createOrder, getDraft } from "../lib/applicationApi";

const requiredConsentKeys = ["privacy", "terms", "refund"];

function ReviewRow({ label, value }) {
  return (
    <div className="site-review-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export function ApplyReviewPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApplicationFlow();
  const detailPath = buildApplyDetailPath(state.selection);
  const [draftSnapshot, setDraftSnapshot] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const paymentPathMap = {
    widget: "/widget/checkout",
    payment: "/payment/checkout",
    brandpay: "/brandpay/checkout",
  };

  const requiredConsentsAccepted = requiredConsentKeys.every((key) => state.consents[key]);
  const reviewDraft = draftSnapshot?.draft;
  const reviewConsents = draftSnapshot?.consents || state.consents;

  useEffect(() => {
    if (!requiredConsentsAccepted) {
      navigate("/apply/consent");
      return;
    }

    async function fetchDraft() {
      if (!state.draftId) {
        return;
      }

      try {
        const json = await getDraft(state.draftId);
        setDraftSnapshot(json);
      } catch (error) {
        setErrorMessage(error.message || "신청 초안을 불러오지 못했습니다.");
      }
    }

    fetchDraft();
  }, [navigate, requiredConsentsAccepted, state.draftId]);

  async function handleProceedPayment() {
    if (!state.draftId) {
      setErrorMessage("먼저 신청 정보를 저장해 주세요.");
      navigate(detailPath);
      return;
    }

    setIsPreparingPayment(true);
    setErrorMessage("");

    try {
      let orderId = state.orderId;

      if (!orderId) {
        const orderResponse = await createOrder({
          draftId: state.draftId,
          orderName: "대회 신청 결제",
          amount: 1,
          customerName: state.applicantInfo.name,
          customerEmail: state.applicantInfo.email,
        });

        orderId = orderResponse.order.orderId;

        dispatch({
          type: "SET_ORDER",
          payload: { orderId },
        });
      }

      const params = new URLSearchParams({
        draftId: state.draftId,
        orderId,
      });

      dispatch({
        type: "SET_FLOW_STEP",
        value: applicationFlowSteps.CHECKOUT,
      });
      navigate(`${paymentPathMap[state.paymentMethod]}?${params.toString()}`);
    } catch (error) {
      setErrorMessage(error.message || "결제 준비에 실패했습니다.");
    } finally {
      setIsPreparingPayment(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card site-apply-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">Review</p>
            <h1>신청 내용 확인</h1>
            <p>입력한 신청 정보를 다시 확인한 뒤 결제를 진행해 주세요.</p>
          </div>

          <div className="site-review-grid">
            <ReviewRow label="참가 부문" value={reviewDraft?.division || state.selection.division} />
            <ReviewRow label="종목" value={reviewDraft?.discipline || state.selection.discipline} />
            <ReviewRow label="성함" value={draftSnapshot?.draft?.name || state.applicantInfo.name} />
            <ReviewRow label="연락처" value={draftSnapshot?.draft?.phone || state.applicantInfo.phone} />
            <ReviewRow label="이메일" value={draftSnapshot?.draft?.email || state.applicantInfo.email} />
            <ReviewRow label="생년월일" value={draftSnapshot?.draft?.birthDate || state.applicantInfo.birthDate} />
            <ReviewRow label="소속" value={draftSnapshot?.draft?.organization || state.applicantInfo.organization} />
            <ReviewRow label="첨부 파일" value={draftSnapshot?.file?.original_filename || state.uploadedFileMeta.originalFilename} />
            <ReviewRow label="참가비" value="1원 테스트 결제" />
            <ReviewRow
              label="동의 항목"
              value={[
                reviewConsents.privacy ? "개인정보" : null,
                reviewConsents.terms ? "유의사항" : null,
                reviewConsents.refund ? "환불규정" : null,
                reviewConsents.marketing ? "마케팅" : null,
                reviewConsents.photoVideo ? "사진/동영상" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </div>

          <NoticeBox title="결제 전 확인 사항">
            <ul className="site-list">
              <li>결제 단계로 이동하면 주문 정보가 생성되며 결제 완료 후 최종 신청서가 확정됩니다.</li>
              <li>신청 내용에 수정이 필요하면 이전 단계로 돌아가 다시 저장해 주세요.</li>
              <li>결제 완료 후에는 신청 번호가 발급되며, 조회 페이지에서 접수 상태를 다시 확인할 수 있습니다.</li>
            </ul>
          </NoticeBox>

          <div className="site-payment-methods">
            <h2 className="site-payment-methods__title">결제 방식</h2>
            <div className="site-chip-group">
              <button
                className={`site-chip ${state.paymentMethod === "widget" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "widget" })}
              >
                Widget
              </button>
              <button
                className={`site-chip ${state.paymentMethod === "payment" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "payment" })}
              >
                Payment
              </button>
              <button
                className={`site-chip ${state.paymentMethod === "brandpay" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "brandpay" })}
              >
                BrandBay
              </button>
            </div>
          </div>

          <div className="site-inline-actions">
            <Button variant="ghost" onClick={() => navigate("/apply/consent")}>이전으로</Button>
            <Button onClick={handleProceedPayment} disabled={isPreparingPayment}>
              {isPreparingPayment ? "결제 준비 중..." : "결제 진행하기"}
            </Button>
          </div>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
