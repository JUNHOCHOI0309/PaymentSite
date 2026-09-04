import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { ApplicationFlowStepper } from "../components/common/ApplicationFlowStepper";
import { Input } from "../components/common/Input";
import { PageShell } from "../components/layout/PageShell";
import { useSpectatorFlow, spectatorFlowSteps } from "../context/SpectatorFlowContext";
import { getPaymentMaintenanceNotice } from "../data/paymentMaintenance";
import refundPolicy from "../data/refundPolicy.json";
import spectatorTicketConfig from "../data/spectatorTicketConfig.json";
import {
  createSpectatorDraft,
  getApplicationEmailVerificationStatus,
  sendApplicationEmailVerificationCode,
  verifyApplicationEmailVerificationCode,
} from "../lib/applicationApi";
import {
  createEmailAddress,
  directEmailDomainValue,
  parseEmailAddress,
  presetEmailDomains,
} from "../lib/emailAddress";

const TICKET_PRICE = spectatorTicketConfig.unitAmount;

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatAmount(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function getKoreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function SpectatorApplyPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useSpectatorFlow();
  const initialEmail = parseEmailAddress(state.applicant.email);
  const [emailLocalPart, setEmailLocalPart] = useState(initialEmail.localPart);
  const [emailDomainSelection, setEmailDomainSelection] = useState(initialEmail.domainSelection);
  const [emailCustomDomain, setEmailCustomDomain] = useState(initialEmail.customDomain);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("idle");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ name: "", phone: "", email: "" });
  const koreaDateKey = getKoreaDateKey();
  const isSalesOpen = koreaDateKey >= spectatorTicketConfig.salesStartDate
    && koreaDateKey <= spectatorTicketConfig.salesEndDate;

  function validate() {
    const nextErrors = {
      name: state.applicant.name.trim() ? "" : "성함을 입력해 주세요.",
      phone: /^010-\d{3,4}-\d{4}$/.test(state.applicant.phone)
        ? ""
        : "010으로 시작하는 휴대전화번호를 입력해 주세요.",
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.applicant.email)
        ? ""
        : "유효한 이메일 주소를 입력해 주세요.",
    };
    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  function setApplicantField(field, value) {
    const nextValue = field === "phone" ? formatPhoneNumber(value) : value;
    if ((field === "name" || field === "email") && nextValue !== state.applicant[field]) {
      setVerificationStatus("idle");
      setVerificationCode("");
      setVerificationMessage("");
    }
    dispatch({ type: "SET_APPLICANT", payload: { [field]: nextValue } });
  }

  function updateEmail({
    localPart = emailLocalPart,
    domainSelection = emailDomainSelection,
    customDomain = emailCustomDomain,
  }) {
    const email = createEmailAddress({ localPart, domainSelection, customDomain });
    setEmailLocalPart(localPart);
    setEmailDomainSelection(domainSelection);
    setEmailCustomDomain(customDomain);
    setApplicantField("email", email);
  }

  async function handleSendCode() {
    if (!isSalesOpen) {
      setErrorMessage("현재 참관객 입장권 판매 기간이 아닙니다.");
      return;
    }
    if (!validate()) return;
    setIsSending(true);
    setErrorMessage("");
    try {
      const response = await sendApplicationEmailVerificationCode(state.applicant);
      setVerificationStatus("sent");
      setVerificationCode("");
      setVerificationMessage(response.message || "인증번호를 전송했습니다.");
    } catch (error) {
      setVerificationMessage(error.message || "인증번호를 전송하지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyCode() {
    if (verificationCode.length !== 6) {
      setVerificationMessage("6자리 인증번호를 입력해 주세요.");
      return;
    }
    setIsVerifying(true);
    try {
      const response = await verifyApplicationEmailVerificationCode({
        ...state.applicant,
        code: verificationCode,
      });
      setVerificationStatus("verified");
      setVerificationMessage(response.message || "이메일 인증이 완료되었습니다.");
    } catch (error) {
      setVerificationStatus("sent");
      setVerificationMessage(error.message || "인증번호를 확인해 주세요.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isSalesOpen) {
      setErrorMessage("현재 참관객 입장권 판매 기간이 아닙니다.");
      return;
    }
    if (!validate()) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const status = await getApplicationEmailVerificationStatus(state.applicant);
      if (!status.verified) throw new Error("이메일 인증을 완료해 주세요.");
      const response = await createSpectatorDraft(state.applicant);
      dispatch({ type: "SET_DRAFT", payload: response.draft });
      dispatch({ type: "SET_FLOW_STEP", value: spectatorFlowSteps.CONSENT });
      navigate("/apply/spectator/consent");
    } catch (error) {
      setErrorMessage(error.message || "참관객 신청 정보를 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--stage-service site-page--spectator">
        <ApplicationFlowStepper currentStep={1} type="spectator" variant="grid-header" />
        <aside className="site-apply-detail__summary site-spectator-summary">
          <p className="site-kicker">SPECTATOR</p>
          <h1>참관객 신청</h1>
          <div className="site-apply-detail__price-card site-spectator-summary__price-card">
            <span>참관객 입장권</span>
            <strong>{formatAmount(TICKET_PRICE)}</strong>
            <small>1인 1매 구매 가능</small>
          </div>
        </aside>
        <form className="site-apply-form site-application-form site-application-form--spectator" onSubmit={handleSubmit}>
          <div className="site-review-card__header">
            <p className="site-kicker">01 / 05 · 신청 정보</p>
            <h1>참관객 정보 입력</h1>
            <p>본인 확인과 입장 안내를 위해 정확한 정보를 입력해 주세요.</p>
          </div>
          <div className="site-application-form__summary">
            <div className="site-application-form__summary-copy">
              <span>신청 상품</span>
              <strong>2026 MUSCLEMANIA® 참관객 입장권</strong>
              <div className="site-application-form__tags">
                <em>1매</em>
                <em>{formatAmount(TICKET_PRICE)}</em>
              </div>
            </div>
          </div>
          <div className="site-form-grid">
            <div className="site-flow-form-section-heading site-field--full">
              <h2>기본 정보</h2>
              <p>입장권 확인과 행사 안내에 사용할 정보를 입력해 주세요.</p>
            </div>
            <Input
              label="성함"
              requirement="필수"
              value={state.applicant.name}
              onChange={(event) => setApplicantField("name", event.target.value)}
              error={fieldErrors.name}
              required
            />
            <Input
              label="연락처"
              requirement="필수"
              value={state.applicant.phone}
              onChange={(event) => setApplicantField("phone", event.target.value)}
              error={fieldErrors.phone}
              placeholder="010-0000-0000"
              required
            />
            <label className="site-field site-field--full">
              <span className="site-field__label">이메일 <span className="site-field__requirement">(필수)</span></span>
              <div className="site-email-verification__email-row">
                <div className="site-email-address">
                  <input
                    className="site-input"
                    value={emailLocalPart}
                    onChange={(event) => updateEmail({ localPart: event.target.value.replace(/[\s@]/g, "") })}
                    autoComplete="username"
                  />
                  <span className="site-email-address__at">@</span>
                  {emailDomainSelection === directEmailDomainValue ? (
                    <span className="site-email-address__custom-control">
                      <input
                        className="site-input site-email-address__custom-input"
                        value={emailCustomDomain}
                        onChange={(event) => updateEmail({ customDomain: event.target.value.replace(/[\s@]/g, "").toLowerCase() })}
                        placeholder="example.com"
                      />
                      <button type="button" className="site-email-address__clear" onClick={() => updateEmail({ domainSelection: "", customDomain: "" })}>×</button>
                    </span>
                  ) : (
                    <select className="site-input" value={emailDomainSelection} onChange={(event) => updateEmail({ domainSelection: event.target.value, customDomain: "" })}>
                      <option value="">도메인 선택</option>
                      {presetEmailDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                      <option value={directEmailDomainValue}>직접 입력</option>
                    </select>
                  )}
                </div>
                <Button className="site-email-verification__action" type="button" onClick={handleSendCode} disabled={isSending || !isSalesOpen}>
                  {isSending ? "전송 중" : verificationStatus === "sent" ? "인증번호 재전송" : "인증번호 전송"}
                </Button>
              </div>
              {fieldErrors.email ? <span className="site-field__error">{fieldErrors.email}</span> : null}
            </label>
            <label className="site-field site-field--full">
              <span className="site-field__label">인증번호 <span className="site-field__requirement">(필수)</span></span>
              <div className="site-email-verification__code-row">
                <input className="site-input" inputMode="numeric" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={verificationStatus === "idle" || verificationStatus === "verified"} placeholder="6자리 인증번호" />
                <Button className="site-email-verification__action" type="button" onClick={handleVerifyCode} disabled={verificationStatus !== "sent" || isVerifying}>
                  {verificationStatus === "verified" ? "인증 완료" : isVerifying ? "확인 중" : "인증 확인"}
                </Button>
              </div>
              {verificationMessage ? <span className={`site-email-verification__message ${verificationStatus === "verified" ? "site-email-verification__message--verified" : ""}`}>{verificationMessage}</span> : null}
            </label>
          </div>
          <section className="site-notice site-spectator-notice">
            <h2>신청 전 확인 사항</h2>
            <p><strong>2026 MUSCLEMANIA® 참관 관객을 모집합니다.</strong></p>
            <p>원활한 입장을 위해 사전 구매를 권장합니다.</p>
            <p><strong>10월 25일 (일) : {formatAmount(TICKET_PRICE)}</strong></p>
            <p>판매 기간: 2026년 8월 3일 ~ 10월 18일 / 선착순 500매</p>
            <p>*선수를 제외한 모든 인원은 입장권을 구매하셔야 대회장에 입장 가능합니다.</p>
            <p>{getPaymentMaintenanceNotice("ko")}</p>
            <h3>환불 안내</h3>
            <div className="site-refund-page__policy-table-wrap">
              <table className="site-refund-page__policy-table">
                <thead><tr><th>적용 구간</th><th>환불 비율</th></tr></thead>
                <tbody>{refundPolicy.personalCancellationRules.map((rule) => <tr key={rule.id}><td>{rule.label}</td><td>{rule.refundPercent}%</td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <div className="site-inline-actions site-spectator-apply__actions site-flow-actions"><Button disabled={isSubmitting || !isSalesOpen} type="submit">{isSubmitting ? "저장 중" : "동의 단계로 계속"}</Button></div>
          {!isSalesOpen ? <p className="site-error-message">참관객 입장권은 2026년 8월 3일부터 10월 18일까지 구매할 수 있습니다.</p> : null}
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </form>
      </section>
    </PageShell>
  );
}
