import { useState } from "react";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import {
  lookupApplication,
  sendLookupVerificationCode,
  verifyLookupVerificationCode,
} from "../lib/applicationApi";

function formatVerificationCode(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function LookupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    verificationCode: "",
  });
  const [results, setResults] = useState([]);
  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [devVerificationCode, setDevVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (field) => (event) => {
    const nextValue =
      field === "verificationCode"
        ? formatVerificationCode(event.target.value)
        : event.target.value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "name" || field === "email"
        ? {
            verificationCode: "",
          }
        : {}),
    }));

    setActionErrorMessage("");
    setResults([]);

    if (field === "name" || field === "email") {
      setVerificationToken("");
      setVerificationMessage("");
      setDevVerificationCode("");
    }
  };

  function validateNameAndEmail() {
    if (!form.name.trim()) {
      return "성함을 입력해 주세요.";
    }

    if (!form.email.trim()) {
      return "이메일을 입력해 주세요.";
    }

    if (!hasValidEmail(form.email)) {
      return "유효한 이메일 주소를 입력해 주세요.";
    }

    return "";
  }

  async function handleSendVerificationCode() {
    const validationMessage = validateNameAndEmail();

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    setIsSendingCode(true);
    setActionErrorMessage("");
    setVerificationMessage("");
    setVerificationToken("");
    setDevVerificationCode("");
    setResults([]);

    try {
      const json = await sendLookupVerificationCode({
        name: form.name,
        email: form.email,
      });

      setForm((current) => ({
        ...current,
        verificationCode: "",
      }));
      setVerificationMessage(json.message || "이메일 인증번호를 전송했습니다.");
      setDevVerificationCode(json.devVerificationCode || "");
    } catch (error) {
      setVerificationMessage("");
      setActionErrorMessage(error.message || "이메일 인증번호를 전송하지 못했습니다.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    const validationMessage = validateNameAndEmail();

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    if (!form.verificationCode.trim()) {
      setActionErrorMessage("이메일로 받은 인증번호를 입력해 주세요.");
      return;
    }

    if (form.verificationCode.length !== 6) {
      setActionErrorMessage("인증번호는 6자리 숫자여야 합니다.");
      return;
    }

    setIsVerifyingCode(true);
    setActionErrorMessage("");
    setVerificationMessage("");

    try {
      const json = await verifyLookupVerificationCode({
        name: form.name,
        email: form.email,
        code: form.verificationCode,
      });

      setVerificationToken(json.verificationToken || "");
      setVerificationMessage(json.message || "이메일 인증이 완료되었습니다.");
    } catch (error) {
      setVerificationToken("");
      setVerificationMessage("");
      setActionErrorMessage(error.message || "인증번호 확인에 실패했습니다.");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function handleLookup() {
    const validationMessage = validateNameAndEmail();

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    if (!verificationToken) {
      setActionErrorMessage("이메일 인증을 먼저 완료해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setActionErrorMessage("");

    try {
      const json = await lookupApplication({
        name: form.name,
        email: form.email,
        verificationToken,
      });

      setResults(
        Array.isArray(json.applications)
          ? json.applications
          : json.application
            ? [json.application]
            : []
      );
    } catch (error) {
      setResults([]);
      setActionErrorMessage(error.message || "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.");
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
            <p>성함과 이메일을 확인한 뒤 이메일 인증을 완료하면 접수 상태를 조회할 수 있습니다.</p>
          </div>

          <div className="site-form-grid">
            <Input
              label="성함"
              value={form.name}
              onChange={setField("name")}
              placeholder="홍길동"
            />
            <Input
              label="이메일"
              value={form.email}
              onChange={setField("email")}
              placeholder="name@example.com"
              type="email"
              inputMode="email"
            />
          </div>

          {actionErrorMessage ? <p className="site-error-message">{actionErrorMessage}</p> : null}

          <div className="site-lookup-actions">
            <Button onClick={handleSendVerificationCode} disabled={isSendingCode}>
              {isSendingCode ? "전송 중..." : "이메일 인증번호 전송"}
            </Button>
          </div>

          <div className="site-lookup-verification">
            <Input
              label="인증번호"
              value={form.verificationCode}
              onChange={setField("verificationCode")}
              placeholder="6자리 숫자"
              type="tel"
              inputMode="numeric"
              hint="입력한 이메일 주소로 전송된 6자리 인증번호를 입력해 주세요."
            />

            <div className="site-lookup-actions">
              <Button onClick={handleVerifyCode} disabled={isVerifyingCode}>
                {isVerifyingCode ? "확인 중..." : "인증 확인"}
              </Button>
              <Button onClick={handleLookup} disabled={isSubmitting}>
                {isSubmitting ? "조회 중..." : "조회하기"}
              </Button>
            </div>
          </div>

          {verificationMessage ? (
            <p className="site-lookup-message site-lookup-message--success">{verificationMessage}</p>
          ) : null}

          {devVerificationCode ? (
            <p className="site-lookup-message">
              개발 환경 인증번호: <strong>{devVerificationCode}</strong>
            </p>
          ) : null}

          <NoticeBox title="조회 안내">
            <ul className="site-list">
              <li>신청 시 입력한 성함과 이메일이 데이터베이스에 일치해야 인증번호를 받을 수 있습니다.</li>
              <li>이메일 인증이 완료되어야 신청 조회가 가능합니다.</li>
              <li>조회 결과에는 개인정보 보호를 위해 일부 정보가 마스킹되어 표시됩니다.</li>
            </ul>
          </NoticeBox>

          {results.length > 0 ? (
            <div className="site-result-card">
              <h3>조회 결과</h3>
              <div className="site-lookup-results">
                {results.map((result) => (
                  <div className="site-lookup-result" key={result.applicationNumber}>
                    <div className="site-review-row"><span>신청 상태</span><strong>{result.status}</strong></div>
                    <div className="site-review-row"><span>신청 번호</span><strong>{result.applicationNumber}</strong></div>
                    <div className="site-review-row"><span>결제 상태</span><strong>{result.paymentStatus}</strong></div>
                    <div className="site-review-row"><span>신청자</span><strong>{result.name}</strong></div>
                    <div className="site-review-row"><span>연락처</span><strong>{result.phone}</strong></div>
                    <div className="site-review-row"><span>이메일</span><strong>{result.email}</strong></div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
