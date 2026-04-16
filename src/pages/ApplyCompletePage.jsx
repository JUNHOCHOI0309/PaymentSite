import { Link } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";

function maskPhone(phone) {
  return phone ? phone.replace(/(\d{3})\d+(\d{4})/, "$1-****-$2") : "-";
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "-";
  }

  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export function ApplyCompletePage() {
  const { state } = useApplicationFlow();

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-complete-card">
          <p className="site-kicker">Complete</p>
          <h1>신청 완료 페이지 뼈대</h1>
          <p>현재는 결제 성공 후 자동 연결 전 단계이므로, 프론트 상태 기준 예시만 표시합니다.</p>

          <div className="site-review-grid">
            <div className="site-review-row"><span>신청 번호</span><strong>APPL-2026-DEMO-001</strong></div>
            <div className="site-review-row"><span>성함</span><strong>{state.applicantInfo.name || "-"}</strong></div>
            <div className="site-review-row"><span>연락처</span><strong>{maskPhone(state.applicantInfo.phone)}</strong></div>
            <div className="site-review-row"><span>이메일</span><strong>{maskEmail(state.applicantInfo.email)}</strong></div>
            <div className="site-review-row"><span>접수 일시</span><strong>{new Date().toLocaleString()}</strong></div>
            <div className="site-review-row"><span>결제 상태</span><strong>PAID</strong></div>
          </div>

          <div className="site-inline-actions">
            <Link to="/">
              <Button variant="ghost">메인으로</Button>
            </Link>
            <Link to="/lookup">
              <Button>신청 조회</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
