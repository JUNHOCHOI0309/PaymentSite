import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { getApplicationByNumber, getApplicationByOrder } from "../lib/applicationApi";

export function ApplyCompletePage() {
  const [searchParams] = useSearchParams();
  const [application, setApplication] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function fetchApplication() {
      const applicationNumber = searchParams.get("applicationNumber");
      const orderId = searchParams.get("orderId");

      if (!applicationNumber && !orderId) {
        return;
      }

      try {
        const json = applicationNumber
          ? await getApplicationByNumber(applicationNumber)
          : await getApplicationByOrder(orderId);

        setApplication(json.application);
      } catch (error) {
        setErrorMessage(error.message || "신청 완료 정보를 불러오지 못했습니다.");
      }
    }

    fetchApplication();
  }, [searchParams]);

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-complete-card">
          <p className="site-kicker">Complete</p>
          <h1>신청 완료</h1>
          <p>신청이 정상적으로 접수되었습니다. 아래 신청 정보를 확인해 주세요.</p>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

          <div className="site-review-grid">
            <div className="site-review-row"><span>신청 번호</span><strong>{application?.applicationNumber || "-"}</strong></div>
            <div className="site-review-row"><span>성함</span><strong>{application?.name || "-"}</strong></div>
            <div className="site-review-row"><span>연락처</span><strong>{application?.phone || "-"}</strong></div>
            <div className="site-review-row"><span>이메일</span><strong>{application?.email || "-"}</strong></div>
            <div className="site-review-row"><span>접수 일시</span><strong>{application?.submittedAt || "-"}</strong></div>
            <div className="site-review-row"><span>결제 상태</span><strong>{application?.paymentStatus || "-"}</strong></div>
          </div>

          <p className="site-field__hint">
            신청 번호는 이후 조회 및 문의 시 필요할 수 있으니 별도로 보관해 주세요.
          </p>

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
