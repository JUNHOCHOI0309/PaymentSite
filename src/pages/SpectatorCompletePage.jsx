import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { getSpectatorOrderByNumber } from "../lib/applicationApi";

export function SpectatorCompletePage() {
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    const number = searchParams.get("spectatorOrderNumber");
    if (!number) return;
    getSpectatorOrderByNumber(number).then((response) => setOrder(response.spectatorOrder)).catch((error) => setErrorMessage(error.message || "신청 정보를 불러오지 못했습니다."));
  }, [searchParams]);

  return (
    <PageShell><section className="site-page site-page--narrow"><div className="site-complete-card site-apply-complete-card">
      <p className="site-kicker">COMPLETE</p><h1>참관객 신청이 완료되었습니다.</h1><p>입장 시 신청번호와 성함을 확인합니다.</p>
      {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
      <div className="site-review-grid"><div className="site-review-row"><span>신청번호</span><strong>{order?.spectatorOrderNumber || "-"}</strong></div><div className="site-review-row"><span>성함</span><strong>{order?.name || "-"}</strong></div><div className="site-review-row"><span>입장권</span><strong>1매</strong></div><div className="site-review-row"><span>결제 금액</span><strong>{order ? `${Number(order.totalAmount).toLocaleString("ko-KR")}원` : "-"}</strong></div></div>
      <div className="site-inline-actions"><Link to="/"><Button variant="ghost">홈으로 돌아가기</Button></Link><Link to="/lookup"><Button>신청 조회</Button></Link></div>
    </div></section></PageShell>
  );
}
