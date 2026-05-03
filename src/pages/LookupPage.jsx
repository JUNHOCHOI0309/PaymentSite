import { useState } from "react";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { lookupApplication } from "../lib/applicationApi";

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function LookupPage() {
  const [form, setForm] = useState({
    applicationNumber: "",
    phone: "",
  });
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]:
        field === "phone"
          ? formatPhoneNumber(event.target.value)
          : event.target.value,
    }));
  };

  async function handleLookup() {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const json = await lookupApplication(form);
      setResult(json.application);
    } catch (error) {
      setResult(null);
      setErrorMessage(error.message || "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card site-lookup-card">
          <div className="site-review-card__header">
            <p className="site-kicker">Lookup</p>
            <h1>신청 조회</h1>
            <p>신청번호와 연락처를 입력하면 접수 상태를 확인할 수 있습니다.</p>
          </div>

          <div className="site-form-grid">
            <Input label="신청 번호" value={form.applicationNumber} onChange={setField("applicationNumber")} placeholder="APPL-2026-XXXX" />
            <Input label="연락처" value={form.phone} onChange={setField("phone")} placeholder="010-0000-0000" />
          </div>

          <div className="site-inline-actions">
            <Button onClick={handleLookup} disabled={isSubmitting}>
              {isSubmitting ? "조회 중..." : "조회하기"}
            </Button>
          </div>

          <NoticeBox title="조회 안내">
            <ul className="site-list">
              <li>신청 완료 화면에서 발급된 신청번호와 신청 시 입력한 연락처를 입력해 주세요.</li>
              <li>조회 결과에는 개인정보 보호를 위해 일부 정보가 마스킹되어 표시됩니다.</li>
            </ul>
          </NoticeBox>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

          {result ? (
            <div className="site-result-card">
              <h3>조회 결과</h3>
              <div className="site-review-row"><span>신청 상태</span><strong>{result.status}</strong></div>
              <div className="site-review-row"><span>신청 번호</span><strong>{result.applicationNumber}</strong></div>
              <div className="site-review-row"><span>결제 상태</span><strong>{result.paymentStatus}</strong></div>
              <div className="site-review-row"><span>신청자</span><strong>{result.name}</strong></div>
              <div className="site-review-row"><span>연락처</span><strong>{result.phone}</strong></div>
              <div className="site-review-row"><span>이메일</span><strong>{result.email}</strong></div>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
