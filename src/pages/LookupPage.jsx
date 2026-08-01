import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import {
  getApplicationRefundQuote,
  getSpectatorRefundQuote,
  getStageServiceSummary,
  lookupApplication,
  sendLookupVerificationCode,
  verifyLookupVerificationCode,
} from "../lib/applicationApi";
import {
  createEmailAddress,
  directEmailDomainValue,
  parseEmailAddress,
  presetEmailDomains,
} from "../lib/emailAddress";

const lookupSessionStorageKey = "mmkorea-lookup-session";

function getStoredLookupSession() {
  try {
    const rawSession = window.sessionStorage.getItem(lookupSessionStorageKey);
    const session = rawSession ? JSON.parse(rawSession) : null;
    const expiresAt = new Date(session?.expiresAt || "");

    if (
      !session?.name ||
      !session?.email ||
      !session?.verificationToken ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      window.sessionStorage.removeItem(lookupSessionStorageKey);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

const stageServiceTitles = {
  "stage-photo": "무대 사진 촬영",
  "stage-video": "무대 영상 촬영",
  "hair-makeup": "헤어&메이크업",
};

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

function formatAmount(value, locale) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatPaymentCompletedAt(value, locale) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LookupPage() {
  const { locale, t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    verificationCode: "",
  });
  const [emailLocalPart, setEmailLocalPart] = useState("");
  const [emailDomainSelection, setEmailDomainSelection] = useState("");
  const [emailCustomDomain, setEmailCustomDomain] = useState("");
  const [results, setResults] = useState([]);
  const [spectatorResults, setSpectatorResults] = useState([]);
  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [recentLookupSession, setRecentLookupSession] = useState(getStoredLookupSession);
  const [devVerificationCode, setDevVerificationCode] = useState("");
  const [verificationDeadline, setVerificationDeadline] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailDomainCopy =
    locale === "ko"
      ? {
          placeholder: "도메인 선택",
          direct: "직접 입력",
          customPlaceholder: "example.com",
        }
      : {
          placeholder: "Select domain",
          direct: "Direct input",
          customPlaceholder: "example.com",
        };

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
        setActionErrorMessage(t("lookup.expired"));
      }
    }

    updateRemainingSeconds();

    const intervalId = window.setInterval(updateRemainingSeconds, 1000);
    return () => window.clearInterval(intervalId);
  }, [verificationDeadline, t]);

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
    setSpectatorResults([]);

    if (field === "name" || field === "email") {
      setVerificationToken("");
      setVerificationMessage("");
      setDevVerificationCode("");
      setVerificationDeadline(null);
      setRecentLookupSession(null);
      window.sessionStorage.removeItem(lookupSessionStorageKey);
    }
  };

  function resetLookupVerification() {
    setVerificationToken("");
    setVerificationMessage("");
    setDevVerificationCode("");
    setVerificationDeadline(null);
    setRecentLookupSession(null);
    window.sessionStorage.removeItem(lookupSessionStorageKey);
  }

  function updateLookupEmail({
    localPart = emailLocalPart,
    domainSelection = emailDomainSelection,
    customDomain = emailCustomDomain,
  }) {
    const nextEmail = createEmailAddress({
      localPart,
      domainSelection,
      customDomain,
    });

    setEmailLocalPart(localPart);
    setEmailDomainSelection(domainSelection);
    setEmailCustomDomain(customDomain);
    setForm((current) => ({
      ...current,
      email: nextEmail,
      verificationCode: "",
    }));
    setActionErrorMessage("");
    setResults([]);
    setSpectatorResults([]);
    resetLookupVerification();
  }

  function handleLookupEmailLocalPartChange(event) {
    updateLookupEmail({
      localPart: event.target.value.replace(/[\s@]/g, ""),
    });
  }

  function handleLookupEmailDomainSelectionChange(event) {
    const nextDomainSelection = event.target.value;
    updateLookupEmail({
      domainSelection: nextDomainSelection,
      customDomain:
        nextDomainSelection === directEmailDomainValue ? emailCustomDomain : "",
    });
  }

  function handleLookupEmailCustomDomainChange(event) {
    updateLookupEmail({
      customDomain: event.target.value.replace(/[\s@]/g, "").toLowerCase(),
    });
  }

  function handleLookupEmailDomainReset() {
    updateLookupEmail({
      domainSelection: "",
      customDomain: "",
    });
  }

  function validateNameAndEmail(name = form.name, email = form.email) {
    if (!name.trim()) {
      return t("lookup.nameRequired");
    }

    if (!email.trim()) {
      return t("lookup.emailRequired");
    }

    if (!hasValidEmail(email)) {
      return t("lookup.emailInvalid");
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
      setVerificationMessage(json.message || t("lookup.sent"));
      setDevVerificationCode(json.devVerificationCode || "");
      setVerificationDeadline(Date.now() + (json.expiresInSeconds || 300) * 1000);
    } catch (error) {
      setVerificationMessage("");
      setActionErrorMessage(error.message || t("lookup.sendFailed"));
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
      setActionErrorMessage(t("lookup.codeRequired"));
      return;
    }

    if (form.verificationCode.length !== 6) {
      setActionErrorMessage(t("lookup.codeLength"));
      return;
    }

    if (!remainingSeconds) {
      setActionErrorMessage(t("lookup.expired"));
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
      setVerificationMessage(json.message || t("lookup.verified"));
      setVerificationDeadline(null);
      const nextLookupSession = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        verificationToken: json.verificationToken || "",
        expiresAt: json.sessionExpiresAt || "",
      };
      window.sessionStorage.setItem(lookupSessionStorageKey, JSON.stringify(nextLookupSession));
      setRecentLookupSession(nextLookupSession);
    } catch (error) {
      setVerificationToken("");
      setVerificationMessage("");
      setActionErrorMessage(error.message || t("lookup.verifyFailed"));
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function handleLookup(session = null) {
    const lookupName = session?.name || form.name;
    const lookupEmail = session?.email || form.email;
    const lookupVerificationToken = session?.verificationToken || verificationToken;
    const validationMessage = validateNameAndEmail(lookupName, lookupEmail);

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    if (!lookupVerificationToken) {
      setActionErrorMessage(t("lookup.verifyFirst"));
      return;
    }

    setIsSubmitting(true);
    setActionErrorMessage("");
    setVerificationMessage("");

    try {
      const json = await lookupApplication({
        name: lookupName,
        email: lookupEmail,
        verificationToken: lookupVerificationToken,
      });

      const applications = Array.isArray(json.applications)
        ? json.applications
        : json.application
          ? [json.application]
          : [];
      const spectators = Array.isArray(json.spectators) ? json.spectators : [];

      const applicationsWithRefundQuotes = await Promise.all(
        applications.map(async (application) => {
          try {
            const refundJson = await getApplicationRefundQuote({
              name: lookupName,
              email: lookupEmail,
              verificationToken: lookupVerificationToken,
              applicationNumber: application.applicationNumber,
            });

            return {
              ...application,
              refundQuote: refundJson.refundQuote || null,
              refundQuoteError: "",
              stageServiceSummary: null,
              stageServiceSummaryError: "",
            };
          } catch (error) {
            return {
              ...application,
              refundQuote: null,
              refundQuoteError: error.message || t("lookup.refundQuoteFailed"),
              stageServiceSummary: null,
              stageServiceSummaryError: "",
            };
          }
        })
      );

      const applicationsWithStageServiceSummary = await Promise.all(
        applicationsWithRefundQuotes.map(async (application) => {
          try {
            const summaryJson = await getStageServiceSummary({
              name: lookupName,
              email: lookupEmail,
              verificationToken: lookupVerificationToken,
              applicationNumber: application.applicationNumber,
            });

            return {
              ...application,
              stageServiceSummary: summaryJson.summary || null,
              stageServiceSummaryError: "",
            };
          } catch (error) {
            return {
              ...application,
              stageServiceSummary: null,
              stageServiceSummaryError: error.message || t("lookup.lookupFailed"),
            };
          }
        }),
      );

      setResults(applicationsWithStageServiceSummary);
      const spectatorsWithRefundQuotes = await Promise.all(
        spectators.map(async (spectator) => {
          try {
            const refundJson = await getSpectatorRefundQuote({
              name: lookupName,
              email: lookupEmail,
              verificationToken: lookupVerificationToken,
              spectatorOrderNumber: spectator.spectatorOrderNumber,
            });
            return { ...spectator, refundQuote: refundJson.refundQuote || null, refundQuoteError: "" };
          } catch (error) {
            return { ...spectator, refundQuote: null, refundQuoteError: error.message || "환불 정보를 불러오지 못했습니다." };
          }
        }),
      );
      setSpectatorResults(spectatorsWithRefundQuotes);
      setVerificationMessage(t("lookup.lookupDone"));
    } catch (error) {
      setResults([]);
      setSpectatorResults([]);
      setActionErrorMessage(error.message || t("lookup.lookupFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecentLookup() {
    const session = getStoredLookupSession();

    if (!session) {
      setRecentLookupSession(null);
      setActionErrorMessage(
        locale === "ko"
          ? "최근 인증 정보가 만료되었습니다. 이메일 인증을 다시 진행해 주세요."
          : "Your recent verification has expired. Please verify your email again."
      );
      return;
    }

    setForm({
      name: session.name,
      email: session.email,
      verificationCode: "",
    });
    const parsedEmailAddress = parseEmailAddress(session.email);
    setEmailLocalPart(parsedEmailAddress.localPart);
    setEmailDomainSelection(parsedEmailAddress.domainSelection);
    setEmailCustomDomain(parsedEmailAddress.customDomain);
    setVerificationToken(session.verificationToken);
    await handleLookup(session);
  }

  const hasStatusMessage = Boolean(actionErrorMessage || verificationMessage || devVerificationCode);
  const completedPaymentResults = results.filter((result) => result.paymentStatus === "DONE");
  const completedStageServicePurchases = results.flatMap((result) =>
    (result.stageServiceSummary?.purchases || []).filter((purchase) => purchase.paymentStatus === "DONE")
  );
  const completedSpectatorResults = spectatorResults.filter((result) => result.paymentStatus === "DONE");
  const totalPaidAmount = completedPaymentResults.reduce(
    (total, result) => total + Number(result.paymentAmount || 0),
    0,
  ) + completedStageServicePurchases.reduce(
    (total, purchase) => total + Number(purchase.totalAmount || 0),
    0
  ) + completedSpectatorResults.reduce(
    (total, result) => total + Number(result.paymentAmount || result.totalAmount || 0),
    0,
  );
  const paymentSummaryCopy =
    locale === "ko"
      ? {
          title: "결제 정산",
          completedCount: "결제 완료 신청 / 서비스",
          totalPaid: "결제 완료 총액",
        }
      : {
          title: "Payment summary",
          completedCount: "Completed applications / services",
          totalPaid: "Completed payment total",
        };

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card site-lookup-card">
          <div className="site-review-card__header">
            <p className="site-kicker">{t("common.kickerLookup")}</p>
            <h1>{t("lookup.title")}</h1>
            <p>{t("lookup.description")}</p>
          </div>

          {recentLookupSession && !verificationToken ? (
            <section className="site-lookup-recent-session" aria-label={locale === "ko" ? "최근 인증 조회" : "Recent verified lookup"}>
              <p>
                {locale === "ko"
                  ? "최근 이메일 인증이 남아 있습니다. 버튼을 누르면 신청 내역을 조회합니다."
                  : "A recent email verification is available. Select the button to look up your applications."}
              </p>
              <Button onClick={handleRecentLookup} disabled={isSubmitting} variant="ghost">
                {locale === "ko" ? "최근 인증으로 조회하기" : "Use recent verification"}
              </Button>
            </section>
          ) : null}

          <div className="site-form-grid site-lookup-form-grid">
            <Input
              label={t("lookup.name")}
              value={form.name}
              onChange={setField("name")}
              placeholder={t("lookup.namePlaceholder")}
            />
            <div className="site-lookup-field-action">
              <label className="site-field site-lookup-field-action__input">
                <span className="site-field__label">{t("lookup.email")}</span>
                <div className="site-email-address">
                  <input
                    className="site-input"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    value={emailLocalPart}
                    onChange={handleLookupEmailLocalPartChange}
                    aria-label={t("lookup.email")}
                  />
                  <span className="site-email-address__at" aria-hidden="true">
                    @
                  </span>
                  {emailDomainSelection === directEmailDomainValue ? (
                    <span className="site-email-address__custom-control">
                      <input
                        className="site-input site-email-address__custom-input"
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        value={emailCustomDomain}
                        onChange={handleLookupEmailCustomDomainChange}
                        placeholder={emailDomainCopy.customPlaceholder}
                        aria-label={emailDomainCopy.direct}
                      />
                      <button
                        className="site-email-address__clear"
                        type="button"
                        onClick={handleLookupEmailDomainReset}
                        aria-label={emailDomainCopy.placeholder}
                        title={emailDomainCopy.placeholder}
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <select
                      className="site-input"
                      value={emailDomainSelection}
                      onChange={handleLookupEmailDomainSelectionChange}
                      aria-label={emailDomainCopy.placeholder}
                    >
                      <option value="">{emailDomainCopy.placeholder}</option>
                      {presetEmailDomains.map((domain) => (
                        <option key={domain} value={domain}>
                          {domain}
                        </option>
                      ))}
                      <option value={directEmailDomainValue}>{emailDomainCopy.direct}</option>
                    </select>
                  )}
                </div>
              </label>
              <Button
                className="site-lookup-field-action__button"
                onClick={handleSendVerificationCode}
                disabled={isSendingCode}
              >
                {isSendingCode ? t("lookup.sendingCode") : t("lookup.sendCode")}
              </Button>
            </div>
          </div>

          <div className="site-lookup-verification">
            <div className="site-lookup-field-action">
              <label className="site-field site-lookup-field-action__input">
                <span className="site-lookup-field__label-row">
                  <span className="site-field__label">{t("lookup.verificationCode")}</span>
                </span>
                <span className="site-lookup-code-input-wrap">
                  <input
                    className="site-input site-lookup-code-input"
                    value={form.verificationCode}
                    onChange={setField("verificationCode")}
                    placeholder={t("lookup.verificationPlaceholder")}
                    type="tel"
                    inputMode="numeric"
                  />
                  {remainingSeconds > 0 ? (
                    <span className="site-lookup-timer">{formatRemainingTime(remainingSeconds)}</span>
                  ) : null}
                </span>
                <span className="site-field__hint">
                  {t("lookup.verificationHint")}
                </span>
              </label>
              <Button
                className="site-lookup-field-action__button"
                onClick={handleVerifyCode}
                disabled={isVerifyingCode}
              >
                {isVerifyingCode ? t("lookup.verifyingCode") : t("lookup.verifyCode")}
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
                    {actionErrorMessage ? t("lookup.info") : t("lookup.status")}
                  </span>
                  {actionErrorMessage ? <p>{actionErrorMessage}</p> : null}
                  {verificationMessage ? <p>{verificationMessage}</p> : null}
                  {devVerificationCode ? (
                    <p className="site-lookup-status-box__meta">
                      {t("lookup.devCode")}: <strong>{devVerificationCode}</strong>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="site-lookup-actions">
              <Button onClick={handleLookup} disabled={isSubmitting}>
                {isSubmitting ? t("lookup.lookingUp") : t("lookup.lookup")}
              </Button>
            </div>
          </div>

          <NoticeBox title={t("lookup.noticeTitle")}>
            <ul className="site-list">
              <li>{t("lookup.notice1")}</li>
              <li>{t("lookup.notice2")}</li>
              <li>{t("lookup.notice3")}</li>
            </ul>
            <Link className="site-notice__link" to="/apply/guide">
              {t("common.viewApplyGuide")}
            </Link>
          </NoticeBox>

          {results.length > 0 || spectatorResults.length > 0 ? (
            <div className="site-result-card">
              <h3>{t("lookup.resultTitle")}</h3>
              <div className="site-lookup-results">
                {results.map((result) => {
                  const canRequestRefund =
                    result.paymentStatus === "DONE" &&
                    result.refundQuote?.canAutoRefund === true &&
                    result.refundRequest?.requestStatus !== "COMPLETED";
                  const refundDisabledReason =
                    result.refundRequest?.requestStatus === "COMPLETED"
                      ? t("lookup.refundProcessed")
                      : result.refundQuote?.message ||
                        result.refundQuoteError ||
                        t("lookup.refundQuoteFailed");

                  return (
                  <div className="site-lookup-result" key={result.applicationNumber}>
                    <div className="site-review-row"><span>{t("lookup.applicationStatus")}</span><strong>{result.status}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.applicationNumber")}</span><strong>{result.applicationNumber}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.discipline", locale === "ko" ? "신청 종목" : "Applied discipline")}</span><strong>{result.discipline || "-"}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.paymentStatus")}</span><strong>{result.paymentStatus}</strong></div>
                    <div className="site-review-row"><span>{locale === "ko" ? "결제 완료 시점" : "Payment completed at"}</span><strong>{formatPaymentCompletedAt(result.paymentCompletedAt, locale)}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.applicant")}</span><strong>{result.name}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.phone")}</span><strong>{result.phone}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.emailLabel")}</span><strong>{result.email}</strong></div>
                    <div className="site-lookup-refund">
                      <h4>{t("lookup.refundTitle")}</h4>
                      {result.refundRequest?.requestStatus === "COMPLETED" ? (
                        <p className="site-lookup-refund__success">{t("lookup.refundProcessed")}</p>
                      ) : null}
                      {result.refundQuote ? (
                        <div className="site-lookup-refund__rows">
                          <div className="site-review-row">
                            <span>{t("lookup.refundStatus")}</span>
                            <strong>
                              {result.refundQuote.requiresManualReview
                                ? t("lookup.refundManualReview")
                                : result.refundQuote.canAutoRefund
                                  ? t("lookup.refundAvailable")
                                  : t("lookup.refundUnavailable")}
                            </strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("lookup.refundPercent")}</span>
                            <strong>
                              {typeof result.refundQuote.refundPercent === "number"
                                ? `${result.refundQuote.refundPercent}%`
                                : "-"}
                            </strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("lookup.refundAmount")}</span>
                            <strong>{formatAmount(result.refundQuote.refundAmount, locale)}</strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("lookup.refundRule")}</span>
                            <strong>{result.refundQuote.matchedRuleLabel || "-"}</strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("lookup.refundPolicyVersion")}</span>
                            <strong>{result.refundQuote.policyVersion || "-"}</strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("lookup.refundReason")}</span>
                            <strong>{result.refundQuote.message || "-"}</strong>
                          </div>
                        </div>
                      ) : result.refundQuoteError ? (
                        <p className="site-lookup-refund__error">{result.refundQuoteError}</p>
                      ) : (
                        <p className="site-lookup-refund__pending">{t("lookup.refundPending")}</p>
                      )}
                      <div className="site-lookup-refund__actions">
                        <span
                          className="site-lookup-refund__action-tooltip"
                          tabIndex={canRequestRefund ? -1 : 0}
                          aria-label={canRequestRefund ? undefined : refundDisabledReason}
                        >
                          <Button
                            disabled={!canRequestRefund}
                            onClick={() =>
                              navigate(
                                `/refund/request?type=application&id=${encodeURIComponent(result.applicationNumber)}`
                              )
                            }
                          >
                            {t("lookup.refundRequest")}
                          </Button>
                          {!canRequestRefund ? (
                            <span className="site-lookup-refund__tooltip" role="tooltip">
                              {refundDisabledReason}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                    <div className="site-lookup-stage-services">
                      <h4>{t("stageService.lookupTitle")}</h4>
                      {result.stageServiceSummary ? (
                        <div className="site-lookup-refund__rows">
                          <div className="site-review-row">
                            <span>{t("stageService.lookupPhoto")}</span>
                            <strong>
                              {result.stageServiceSummary.hasStagePhoto
                                ? t("stageService.lookupPurchased")
                                : t("stageService.lookupMissing")}
                            </strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("stageService.lookupVideo")}</span>
                            <strong>
                              {result.stageServiceSummary.hasStageVideo
                                ? t("stageService.lookupPurchased")
                                : t("stageService.lookupMissing")}
                            </strong>
                          </div>
                          <div className="site-review-row">
                            <span>{t("stageService.lookupHairMakeup")}</span>
                            <strong>
                              {result.stageServiceSummary.hasHairMakeup
                                ? t("stageService.lookupPurchased")
                                : t("stageService.lookupMissing")}
                            </strong>
                          </div>
                        </div>
                      ) : result.stageServiceSummaryError ? (
                        <p className="site-lookup-refund__error">{result.stageServiceSummaryError}</p>
                      ) : null}
                      {result.stageServiceSummary?.purchases?.length ? (
                        <div className="site-lookup-stage-services__purchases">
                          {result.stageServiceSummary.purchases.map((purchase) => (
                            <article
                              className="site-lookup-stage-services__purchase"
                              key={purchase.serviceOrderNumber}
                            >
                              <strong>
                                {stageServiceTitles[purchase.serviceType] || purchase.serviceType}
                                {purchase.linkedDiscipline ? ` · ${purchase.linkedDiscipline}` : ""}
                              </strong>
                              <div className="site-review-row">
                                <span>주문 번호</span>
                                <strong>{purchase.serviceOrderNumber}</strong>
                              </div>
                              <div className="site-review-row">
                                <span>결제 상태</span>
                                <strong>{purchase.paymentStatus}</strong>
                              </div>
                              <div className="site-review-row">
                                <span>결제 금액</span>
                                <strong>{formatAmount(purchase.totalAmount, locale)}</strong>
                              </div>
                              {purchase.paymentStatus === "DONE" ? (
                                <div className="site-lookup-refund__actions">
                                  <Button
                                    onClick={() =>
                                      navigate(
                                        `/refund/request?type=stage-service&id=${encodeURIComponent(purchase.serviceOrderNumber)}`
                                      )
                                    }
                                  >
                                    {t("lookup.refundRequest")}
                                  </Button>
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : null}
                      {result.stageServiceSummary &&
                      (!result.stageServiceSummary.hasStagePhoto ||
                        !result.stageServiceSummary.hasStageVideo ||
                        !result.stageServiceSummary.hasHairMakeup) ? (
                        <div className="site-lookup-refund__actions">
                          <a
                            className="site-lookup-stage-services__link"
                            href={`/apply/stage-services?name=${encodeURIComponent(form.name)}&email=${encodeURIComponent(form.email)}`}
                          >
                            {t("stageService.lookupSelectLink")}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  );
                })}
              </div>
              {spectatorResults.length > 0 ? (
                <section className="site-lookup-spectators" aria-label="참관객 신청 내역">
                  <h3>참관객 신청 내역</h3>
                  {spectatorResults.map((spectator) => {
                    const canRequestRefund = spectator.paymentStatus === "DONE" && spectator.refundQuote?.canAutoRefund === true;
                    const disabledReason = spectator.refundQuote?.message || spectator.refundQuoteError || "현재 환불 가능 여부를 확인할 수 없습니다.";
                    return (
                      <article className="site-lookup-result" key={spectator.spectatorOrderNumber}>
                        <div className="site-review-row"><span>신청번호</span><strong>{spectator.spectatorOrderNumber}</strong></div>
                        <div className="site-review-row"><span>신청자</span><strong>{spectator.name}</strong></div>
                        <div className="site-review-row"><span>입장권</span><strong>{spectator.quantity || 1}매</strong></div>
                        <div className="site-review-row"><span>결제 상태</span><strong>{spectator.paymentStatus}</strong></div>
                        <div className="site-review-row"><span>결제 금액</span><strong>{formatAmount(spectator.paymentAmount || spectator.totalAmount, locale)}</strong></div>
                        <div className="site-review-row"><span>결제 완료 시점</span><strong>{formatPaymentCompletedAt(spectator.paymentCompletedAt, locale)}</strong></div>
                        <div className="site-lookup-refund">
                          <h4>환불 가능 정보</h4>
                          <div className="site-review-row"><span>환불 비율</span><strong>{typeof spectator.refundQuote?.refundPercent === "number" ? `${spectator.refundQuote.refundPercent}%` : "-"}</strong></div>
                          <div className="site-review-row"><span>예상 환불 금액</span><strong>{formatAmount(spectator.refundQuote?.refundAmount, locale)}</strong></div>
                          <div className="site-lookup-refund__actions">
                            <span className="site-lookup-refund__action-tooltip" tabIndex={canRequestRefund ? -1 : 0}>
                              <Button disabled={!canRequestRefund} onClick={() => navigate(`/refund/request?type=spectator&id=${encodeURIComponent(spectator.spectatorOrderNumber)}`)}>환불 신청</Button>
                              {!canRequestRefund ? <span className="site-lookup-refund__tooltip" role="tooltip">{disabledReason}</span> : null}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ) : null}
              <section className="site-lookup-payment-summary" aria-label={paymentSummaryCopy.title}>
                <h4>{paymentSummaryCopy.title}</h4>
                <div className="site-review-row">
                  <span>{paymentSummaryCopy.completedCount}</span>
                  <strong>{completedPaymentResults.length + completedStageServicePurchases.length + completedSpectatorResults.length}</strong>
                </div>
                <div className="site-review-row">
                  <span>{paymentSummaryCopy.totalPaid}</span>
                  <strong>{formatAmount(totalPaidAmount, locale)}</strong>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
