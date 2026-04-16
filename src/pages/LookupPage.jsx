import { useState } from "react";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";

export function LookupPage() {
  const [form, setForm] = useState({
    applicationNumber: "",
    phone: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const setField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">Lookup</p>
            <h1>신청 조회</h1>
            <p>실제 구현 시에는 신청번호 + 연락처 조합으로 서버 조회와 rate limit을 붙이는 것이 맞습니다.</p>
          </div>

          <div className="site-form-grid">
            <Input label="신청 번호" value={form.applicationNumber} onChange={setField("applicationNumber")} placeholder="APPL-2026-XXXX" />
            <Input label="연락처" value={form.phone} onChange={setField("phone")} placeholder="010-0000-0000" />
          </div>

          <div className="site-inline-actions">
            <Button onClick={() => setSubmitted(true)}>조회하기</Button>
          </div>

          <NoticeBox title="보안 메모">
            <ul className="site-list">
              <li>실서비스에서는 brute force 방지를 위해 rate limit이 필요합니다.</li>
              <li>조회 실패 메시지는 모호하게 유지하는 편이 안전합니다.</li>
            </ul>
          </NoticeBox>

          {submitted ? (
            <div className="site-result-card">
              <h3>조회 결과 예시</h3>
              <div className="site-review-row"><span>신청 상태</span><strong>접수 완료</strong></div>
              <div className="site-review-row"><span>신청 번호</span><strong>{form.applicationNumber || "APPL-2026-DEMO-001"}</strong></div>
              <div className="site-review-row"><span>결제 상태</span><strong>PAID</strong></div>
              <div className="site-review-row"><span>안내 문구</span><strong>입력한 정보와 일치하는 접수 내역 예시를 표시하고 있습니다.</strong></div>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
