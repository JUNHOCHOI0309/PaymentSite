import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import {
  getApplicationRefundQuote,
  getStageServiceSummary,
  lookupApplication,
  sendLookupVerificationCode,
  verifyLookupVerificationCode,
} from "../lib/applicationApi";

const lookupSessionStorageKey = "mmkorea-lookup-session";

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

export function LookupPage() {
  const { locale, t } = useLanguage();
  const navigate = useNavigate();
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

    if (field === "name" || field === "email") {
      setVerificationToken("");
      setVerificationMessage("");
      setDevVerificationCode("");
      setVerificationDeadline(null);
      window.sessionStorage.removeItem(lookupSessionStorageKey);
    }
  };

  function validateNameAndEmail() {
    if (!form.name.trim()) {
      return t("lookup.nameRequired");
    }

    if (!form.email.trim()) {
      return t("lookup.emailRequired");
    }

    if (!hasValidEmail(form.email)) {
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
      window.sessionStorage.setItem(
        lookupSessionStorageKey,
        JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          verificationToken: json.verificationToken || "",
        })
      );
    } catch (error) {
      setVerificationToken("");
      setVerificationMessage("");
      setActionErrorMessage(error.message || t("lookup.verifyFailed"));
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
      setActionErrorMessage(t("lookup.verifyFirst"));
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

      const applications = Array.isArray(json.applications)
        ? json.applications
        : json.application
          ? [json.application]
          : [];

      const applicationsWithRefundQuotes = await Promise.all(
        applications.map(async (application) => {
          try {
            const refundJson = await getApplicationRefundQuote({
              name: form.name,
              email: form.email,
              verificationToken,
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
              name: form.name,
              email: form.email,
              verificationToken,
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
      setVerificationMessage(t("lookup.lookupDone"));
    } catch (error) {
      setResults([]);
      setActionErrorMessage(error.message || t("lookup.lookupFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasStatusMessage = Boolean(actionErrorMessage || verificationMessage || devVerificationCode);
  const completedPaymentResults = results.filter((result) => result.paymentStatus === "DONE");
  const completedStageServicePurchases = results.flatMap((result) =>
    (result.stageServiceSummary?.purchases || []).filter((purchase) => purchase.paymentStatus === "DONE")
  );
  const totalPaidAmount = completedPaymentResults.reduce(
    (total, result) => total + Number(result.paymentAmount || 0),
    0,
  ) + completedStageServicePurchases.reduce(
    (total, purchase) => total + Number(purchase.totalAmount || 0),
    0
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

          <div className="site-form-grid">
            <Input
              label={t("lookup.name")}
              value={form.name}
              onChange={setField("name")}
              placeholder={t("lookup.namePlaceholder")}
            />
            <div className="site-lookup-field-action">
              <Input
                className="site-lookup-field-action__input"
                label={t("lookup.email")}
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

          {results.length > 0 ? (
            <div className="site-result-card">
              <h3>{t("lookup.resultTitle")}</h3>
              <div className="site-lookup-results">
                {results.map((result) => (
                  <div className="site-lookup-result" key={result.applicationNumber}>
                    <div className="site-review-row"><span>{t("lookup.applicationStatus")}</span><strong>{result.status}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.applicationNumber")}</span><strong>{result.applicationNumber}</strong></div>
                    <div className="site-review-row"><span>{t("lookup.paymentStatus")}</span><strong>{result.paymentStatus}</strong></div>
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
                      {result.refundQuote?.canAutoRefund && result.paymentStatus === "DONE" ? (
                        <div className="site-lookup-refund__actions">
                          <Button
                            onClick={() =>
                              navigate(
                                `/refund/request?type=application&id=${encodeURIComponent(result.applicationNumber)}`
                              )
                            }
                          >
                            {t("lookup.refundRequest")}
                          </Button>
                        </div>
                      ) : null}
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
                ))}
              </div>
              <section className="site-lookup-payment-summary" aria-label={paymentSummaryCopy.title}>
                <h4>{paymentSummaryCopy.title}</h4>
                <div className="site-review-row">
                  <span>{paymentSummaryCopy.completedCount}</span>
                  <strong>{completedPaymentResults.length}</strong>
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
