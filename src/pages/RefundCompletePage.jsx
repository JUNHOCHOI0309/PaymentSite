import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";

function formatAmount(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function RefundCompletePage() {
  const location = useLocation();
  const refund = location.state || {};

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-complete-card site-refund-complete-card">
          <p className="site-kicker">REFUND COMPLETE</p>
          <h1>환불 요청이 완료되었습니다.</h1>
          <p>결제 수단의 처리 상태에 따라 실제 환불 반영 시점은 다를 수 있습니다.</p>
          <div className="site-review-grid">
            <div className="site-review-row"><span>환불 대상</span><strong>{refund.targetTitle || "-"}</strong></div>
            <div className="site-review-row"><span>환불 비율</span><strong>{typeof refund.refundPercent === "number" ? `${refund.refundPercent}%` : "-"}</strong></div>
            <div className="site-review-row"><span>환불 예정 금액</span><strong>{formatAmount(refund.refundAmount)}</strong></div>
          </div>
          <div className="site-inline-actions">
            <Link to="/lookup"><Button variant="ghost">신청 조회로 돌아가기</Button></Link>
            <Link to="/"><Button>홈으로 돌아가기</Button></Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
