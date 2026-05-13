import { useEffect, useState } from "react";
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

function formatRemainingTime(remainingSeconds) {
  const safeSeconds = Math.max(0, remainingSeconds);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  const [verificationDeadline, setVerificationDeadline] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!verificationDeadline) {
      setRemainingSeconds(0);
      return;
    }

    function updateRemainingSeconds() {
      const nextRemainingSeconds = Math.max(
        0,
        Math.ceil((verificationDeadline - Date.now()) / 1000)
      );

      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds === 0) {
        setVerificationDeadline(null);
        setVerificationToken("");
        setVerificationMessage("");
        setActionErrorMessage("인증번호 입력 시간이 만료되었습니다. 다시 전송해 주세요.");
      }
    }

    updateRemainingSeconds();

    const intervalId = window.setInterval(updateRemainingSeconds, 1000);
    return () => window.clearInterval(intervalId);
  }, [verificationDeadline]);

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
      setVerificationDeadline(null);
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
    setVerificationDeadline(null);
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
      setVerificationDeadline(Date.now() + (json.expiresInSeconds || 300) * 1000);
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

    if (!remainingSeconds) {
      setActionErrorMessage("인증번호 입력 시간이 만료되었습니다. 다시 전송해 주세요.");
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
      setVerificationDeadline(null);
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
    setVerificationMessage("");

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
      setVerificationMessage("신청 내역을 조회했습니다.");
    } catch (error) {
      setResults([]);
      setActionErrorMessage(error.message || "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasStatusMessage = Boolean(actionErrorMessage || verificationMessage || devVerificationCode);

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
            <div className="site-lookup-field-action">
              <Input
                className="site-lookup-field-action__input"
                label="이메일"
                value={form.email}
                onChange={setField("email")}
                placeholder="name@example.com"
                type="email"
                inputMode="email"
              />
              <Button
                className="site-lookup-field-action__button"
                onClick={handleSendVerificationCode}
                disabled={isSendingCode}
              >
                {isSendingCode ? "전송 중..." : "인증번호 전송"}
              </Button>
            </div>
          </div>

          <div className="site-lookup-verification">
            <div className="site-lookup-field-action">
              <label className="site-field site-lookup-field-action__input">
                <span className="site-lookup-field__label-row">
                  <span className="site-field__label">인증번호</span>
                </span>
                <span className="site-lookup-code-input-wrap">
                  <input
                    className="site-input site-lookup-code-input"
                    value={form.verificationCode}
                    onChange={setField("verificationCode")}
                    placeholder="6자리 숫자"
                    type="tel"
                    inputMode="numeric"
                  />
                  {remainingSeconds > 0 ? (
                    <span className="site-lookup-timer">{formatRemainingTime(remainingSeconds)}</span>
                  ) : null}
                </span>
                <span className="site-field__hint">
                  입력한 이메일 주소로 전송된 6자리 인증번호를 입력해 주세요.
                </span>
              </label>
              <Button
                className="site-lookup-field-action__button"
                onClick={handleVerifyCode}
                disabled={isVerifyingCode}
              >
                {isVerifyingCode ? "확인 중..." : "인증 확인"}
              </Button>
            </div>

            <div className="site-lookup-status-area">
              {hasStatusMessage ? (
                <div
                  className={`site-lookup-status-box ${
                    actionErrorMessage ? "site-lookup-status-box--error" : "site-lookup-status-box--success"
                  }`.trim()}
                >
                  <span className="site-lookup-status-box__badge">
                    {actionErrorMessage ? "안내" : "상태"}
                  </span>
                  {actionErrorMessage ? <p>{actionErrorMessage}</p> : null}
                  {verificationMessage ? <p>{verificationMessage}</p> : null}
                  {devVerificationCode ? (
                    <p className="site-lookup-status-box__meta">
                      개발 환경 인증번호: <strong>{devVerificationCode}</strong>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="site-lookup-actions">
              <Button onClick={handleLookup} disabled={isSubmitting}>
                {isSubmitting ? "조회 중..." : "조회하기"}
              </Button>
            </div>
          </div>

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
