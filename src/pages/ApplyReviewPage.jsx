import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";

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

  const paymentPathMap = {
    widget: "/widget/checkout",
    payment: "/payment/checkout",
    brandpay: "/brandpay/checkout",
  };

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">Review</p>
            <h1>신청 내용 확인</h1>
            <p>결제 직전 확인 단계입니다. 이후에는 기존 결제 페이지로 이동합니다.</p>
          </div>

          <div className="site-review-grid">
            <ReviewRow label="성함" value={state.applicantInfo.name} />
            <ReviewRow label="연락처" value={state.applicantInfo.phone} />
            <ReviewRow label="이메일" value={state.applicantInfo.email} />
            <ReviewRow label="생년월일" value={state.applicantInfo.birthDate} />
            <ReviewRow label="소속" value={state.applicantInfo.organization} />
            <ReviewRow label="업로드 파일" value={state.uploadedFileMeta.originalFilename} />
            <ReviewRow label="참가비" value="1원 테스트 결제" />
            <ReviewRow
              label="동의 상태"
              value={[
                state.consents.privacy ? "개인정보" : null,
                state.consents.terms ? "유의사항" : null,
                state.consents.refund ? "환불규정" : null,
                state.consents.marketing ? "마케팅" : null,
              ].filter(Boolean).join(", ")}
            />
          </div>

          <NoticeBox title="결제 전 다시 확인할 내용">
            <ul className="site-list">
              <li>이전 단계에서 입력한 내용이 맞는지 확인합니다.</li>
              <li>최종 구현 시에는 이 단계에서 draft를 서버에 저장한 뒤 결제 주문을 생성합니다.</li>
              <li>현재 뼈대에서는 기존 결제 라우트로만 연결합니다.</li>
            </ul>
          </NoticeBox>

          <div className="site-inline-actions">
            <Button variant="ghost" onClick={() => navigate("/apply")}>이전으로</Button>
            <Link to={paymentPathMap[state.paymentMethod]}>
              <Button>결제 진행하기</Button>
            </Link>
          </div>

          <div className="site-payment-methods">
            <span>결제 방식 선택</span>
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
                Brandpay
              </button>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
