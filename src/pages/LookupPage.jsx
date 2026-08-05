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
  getStageServiceRefundQuote,
  getStageServiceSummary,
  lookupApplication,
  lookupApplicationByNumber,
  lookupApplicationByPhone,
  sendLookupPhoneVerificationCode,
  sendLookupVerificationCode,
  verifyLookupPhoneVerificationCode,
  verifyLookupVerificationCode,
} from "../lib/applicationApi";
import {
  createEmailAddress,
  directEmailDomainValue,
  parseEmailAddress,
  presetEmailDomains,
} from "../lib/emailAddress";

const lookupSessionStorageKey = "mmkorea-lookup-session";
const lookupPhoneSessionStorageKey = "mmkorea-lookup-phone-session";

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

function getStoredLookupPhoneSession() {
  try {
    const rawSession = window.sessionStorage.getItem(lookupPhoneSessionStorageKey);
    const session = rawSession ? JSON.parse(rawSession) : null;
    const expiresAt = new Date(session?.expiresAt || "");

    if (
      !session?.name ||
      !session?.phone ||
      !session?.verificationToken ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      window.sessionStorage.removeItem(lookupPhoneSessionStorageKey);
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

function getStageServiceLinkedDisciplines(purchase) {
  const linkedDisciplines = (purchase?.linkedApplications || [])
    .map((application) => application.discipline)
    .filter(Boolean)
    .join(", ");

  return linkedDisciplines || purchase?.linkedDiscipline || "";
}

function formatVerificationCode(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function hasValidPhoneNumber(value) {
  return String(value || "").replace(/\D/g, "").length === 11;
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
    phone: "",
    verificationCode: "",
    applicationNumber: "",
  });
  const [lookupMode, setLookupMode] = useState("identity");
  const [emailLocalPart, setEmailLocalPart] = useState("");
  const [emailDomainSelection, setEmailDomainSelection] = useState("");
  const [emailCustomDomain, setEmailCustomDomain] = useState("");
  const [results, setResults] = useState([]);
  const [spectatorResults, setSpectatorResults] = useState([]);
  const [numberLookupResult, setNumberLookupResult] = useState(null);
  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [phoneVerificationToken, setPhoneVerificationToken] = useState("");
  const [recentLookupSession, setRecentLookupSession] = useState(getStoredLookupSession);
  const [recentPhoneLookupSession, setRecentPhoneLookupSession] = useState(getStoredLookupPhoneSession);
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
        : field === "phone"
          ? formatPhoneNumber(event.target.value)
        : event.target.value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "name" || field === "email" || field === "phone"
        ? {
            verificationCode: "",
          }
        : {}),
    }));

    setActionErrorMessage("");
    setResults([]);
    setSpectatorResults([]);
    setNumberLookupResult(null);

    if (field === "name" || field === "email") {
      resetLookupVerification();
    }

    if (field === "name" || field === "phone") {
      resetPhoneLookupVerification();
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

  function resetPhoneLookupVerification() {
    setPhoneVerificationToken("");
    setVerificationMessage("");
    setVerificationDeadline(null);
    setRecentPhoneLookupSession(null);
    window.sessionStorage.removeItem(lookupPhoneSessionStorageKey);
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
    setNumberLookupResult(null);
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

  function validateNameAndPhone(name = form.name, phone = form.phone) {
    if (!name.trim()) {
      return locale === "ko" ? "성함을 입력해 주세요." : "Enter your name.";
    }

    if (!phone.trim()) {
      return locale === "ko" ? "휴대전화 번호를 입력해 주세요." : "Enter your phone number.";
    }

    if (!hasValidPhoneNumber(phone)) {
      return locale === "ko" ? "유효한 휴대전화 번호를 입력해 주세요." : "Enter a valid phone number.";
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

  async function handleSendPhoneVerificationCode() {
    const validationMessage = validateNameAndPhone();

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    setIsSendingCode(true);
    setActionErrorMessage("");
    setVerificationMessage("");
    setPhoneVerificationToken("");
    setVerificationDeadline(null);
    setResults([]);
    setSpectatorResults([]);

    try {
      const json = await sendLookupPhoneVerificationCode({
        name: form.name,
        phone: form.phone,
      });

      setForm((current) => ({
        ...current,
        verificationCode: "",
      }));
      setVerificationMessage(json.message || (locale === "ko" ? "SMS 인증번호를 전송했습니다." : "SMS verification code sent."));
      setVerificationDeadline(Date.now() + (json.expiresInSeconds || 300) * 1000);
    } catch (error) {
      setVerificationMessage("");
      setActionErrorMessage(error.message || (locale === "ko" ? "SMS 인증번호를 전송하지 못했습니다." : "Unable to send the SMS code."));
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyPhoneCode() {
    const validationMessage = validateNameAndPhone();

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
      const json = await verifyLookupPhoneVerificationCode({
        name: form.name,
        phone: form.phone,
        code: form.verificationCode,
      });

      setPhoneVerificationToken(json.verificationToken || "");
      setVerificationMessage(json.message || (locale === "ko" ? "SMS 인증이 완료되었습니다." : "SMS verification completed."));
      setVerificationDeadline(null);
      const nextPhoneLookupSession = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        verificationToken: json.verificationToken || "",
        expiresAt: json.sessionExpiresAt || "",
      };
      window.sessionStorage.setItem(lookupPhoneSessionStorageKey, JSON.stringify(nextPhoneLookupSession));
      setRecentPhoneLookupSession(nextPhoneLookupSession);
    } catch (error) {
      setPhoneVerificationToken("");
      setVerificationMessage("");
      setActionErrorMessage(error.message || (locale === "ko" ? "SMS 인증번호 확인에 실패했습니다." : "Unable to verify the SMS code."));
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
    setNumberLookupResult(null);

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

  async function handlePhoneLookup() {
    const validationMessage = validateNameAndPhone();

    if (validationMessage) {
      setActionErrorMessage(validationMessage);
      return;
    }

    if (!phoneVerificationToken) {
      setActionErrorMessage(
        locale === "ko"
          ? "SMS 인증을 먼저 완료해 주세요."
          : "Complete SMS verification first."
      );
      return;
    }

    setIsSubmitting(true);
    setActionErrorMessage("");
    setVerificationMessage("");
    setNumberLookupResult(null);

    try {
      const json = await lookupApplicationByPhone({
        name: form.name,
        phone: form.phone,
        verificationToken: phoneVerificationToken,
      });

      const phoneLookupIdentity = {
        name: form.name,
        phone: form.phone,
        verificationToken: phoneVerificationToken,
      };
      const applications = Array.isArray(json.applications) ? json.applications : [];
      const spectators = Array.isArray(json.spectators) ? json.spectators : [];

      const applicationsWithRefundQuotes = await Promise.all(
        applications.map(async (application) => {
          let refundQuote = null;
          let refundQuoteError = "";

          try {
            const refundJson = await getApplicationRefundQuote({
              ...phoneLookupIdentity,
              applicationNumber: application.applicationNumber,
            });
            refundQuote = refundJson.refundQuote || null;
          } catch (error) {
            refundQuoteError = error.message || t("lookup.refundQuoteFailed");
          }

          const purchases = application.stageServiceSummary?.purchases || [];
          const purchasesWithRefundQuotes = await Promise.all(
            purchases.map(async (purchase) => {
              try {
                const refundJson = await getStageServiceRefundQuote({
                  ...phoneLookupIdentity,
                  serviceOrderNumber: purchase.serviceOrderNumber,
                });
                return { ...purchase, refundQuote: refundJson.refundQuote || null, refundQuoteError: "" };
              } catch (error) {
                return {
                  ...purchase,
                  refundQuote: null,
                  refundQuoteError: error.message || t("lookup.refundQuoteFailed"),
                };
              }
            }),
          );

          return {
            ...application,
            refundQuote,
            refundQuoteError,
            stageServiceSummary: application.stageServiceSummary
              ? { ...application.stageServiceSummary, purchases: purchasesWithRefundQuotes }
              : null,
            stageServiceSummaryError: "",
          };
        }),
      );
      const spectatorsWithRefundQuotes = await Promise.all(
        spectators.map(async (spectator) => {
          try {
            const refundJson = await getSpectatorRefundQuote({
              ...phoneLookupIdentity,
              spectatorOrderNumber: spectator.spectatorOrderNumber,
            });
            return { ...spectator, refundQuote: refundJson.refundQuote || null, refundQuoteError: "" };
          } catch (error) {
            return {
              ...spectator,
              refundQuote: null,
              refundQuoteError: error.message || t("lookup.refundQuoteFailed"),
            };
          }
        }),
      );

      setResults(applicationsWithRefundQuotes);
      setSpectatorResults(spectatorsWithRefundQuotes);
      setVerificationMessage(
        locale === "ko"
          ? "SMS 인증으로 신청 내역을 조회했습니다."
          : "Your applications were found with SMS verification."
      );
    } catch (error) {
      setResults([]);
      setSpectatorResults([]);
      setActionErrorMessage(
        error.message ||
          (locale === "ko" ? "SMS 인증 신청 조회에 실패했습니다." : "Unable to look up applications with SMS verification.")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLookupModeChange(mode) {
    setLookupMode(mode);
    setActionErrorMessage("");
    setVerificationMessage("");
    setDevVerificationCode("");
    setVerificationDeadline(null);
    setPhoneVerificationToken("");
    setForm((current) => ({
      ...current,
      verificationCode: "",
    }));
    setResults([]);
    setSpectatorResults([]);
    setNumberLookupResult(null);
  }

  async function handleNumberLookup() {
    const applicationNumber = form.applicationNumber.trim().toUpperCase();

    if (!applicationNumber) {
      setActionErrorMessage(locale === "ko" ? "신청번호를 입력해 주세요." : "Enter your application number.");
      return;
    }

    setIsSubmitting(true);
    setActionErrorMessage("");
    setVerificationMessage("");
    setResults([]);
    setSpectatorResults([]);

    try {
      const json = await lookupApplicationByNumber({ applicationNumber });
      setNumberLookupResult(json.record || null);
    } catch (error) {
      setNumberLookupResult(null);
      setActionErrorMessage(error.message || (locale === "ko" ? "신청 내역을 조회하지 못했습니다." : "Unable to look up the application."));
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
      phone: "",
      verificationCode: "",
      applicationNumber: "",
    });
    const parsedEmailAddress = parseEmailAddress(session.email);
    setEmailLocalPart(parsedEmailAddress.localPart);
    setEmailDomainSelection(parsedEmailAddress.domainSelection);
    setEmailCustomDomain(parsedEmailAddress.customDomain);
    setVerificationToken(session.verificationToken);
    await handleLookup(session);
  }

  const hasStatusMessage = Boolean(actionErrorMessage || verificationMessage || devVerificationCode);
  const isPhoneLookup = lookupMode === "phone";

  function getRefundRequestPath(type, id) {
    const access = isPhoneLookup ? "phone" : "email";
    return `/refund/request?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&access=${access}`;
  }
  const completedPaymentResults = results.filter((result) => result.paymentStatus === "DONE");
  const completedStageServicePurchases = Array.from(
    results
      .flatMap((result) => result.stageServiceSummary?.purchases || [])
      .filter((purchase) => purchase.paymentStatus === "DONE")
      .reduce((purchasesByOrderNumber, purchase) => {
        purchasesByOrderNumber.set(purchase.serviceOrderNumber, purchase);
        return purchasesByOrderNumber;
      }, new Map())
      .values(),
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
            <p>
              {lookupMode === "number"
                ? (locale === "ko" ? "완료 화면에 표시된 신청번호로 결제 및 신청 상태를 확인할 수 있습니다." : "Use the application number shown on the completion page to check payment and application status.")
                : lookupMode === "phone"
                  ? (locale === "ko" ? "성함과 휴대전화 SMS 인증으로 신청·결제 내역과 환불 가능 정보를 조회할 수 있습니다." : "Verify your name and phone by SMS to view applications, payments, and refund availability.")
                  : t("lookup.description")}
            </p>
          </div>

          <div className="site-lookup-mode-grid" role="tablist" aria-label={locale === "ko" ? "신청 조회 방식" : "Lookup method"}>
            <button
              className={`site-lookup-mode-card ${lookupMode === "identity" ? "site-lookup-mode-card--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={lookupMode === "identity"}
              onClick={() => handleLookupModeChange("identity")}
            >
              <strong>{locale === "ko" ? "이름 + 이메일로 조회" : "Name + email"}</strong>
              <span>{locale === "ko" ? "이메일 인증 후 전체 신청 내역을 확인합니다." : "Verify your email to view all applications."}</span>
            </button>
            <button
              className={`site-lookup-mode-card ${lookupMode === "phone" ? "site-lookup-mode-card--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={lookupMode === "phone"}
              onClick={() => handleLookupModeChange("phone")}
            >
              <strong>{locale === "ko" ? "이름 + 휴대전화로 조회" : "Name + phone"}</strong>
              <span>{locale === "ko" ? "SMS 인증 후 신청·환불 정보를 확인합니다." : "Verify by SMS to view applications and refund details."}</span>
            </button>
            <button
              className={`site-lookup-mode-card ${lookupMode === "number" ? "site-lookup-mode-card--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={lookupMode === "number"}
              onClick={() => handleLookupModeChange("number")}
            >
              <strong>{locale === "ko" ? "신청번호로 조회" : "Application number"}</strong>
              <span>{locale === "ko" ? "완료 화면의 신청번호로 결제 정보를 확인합니다." : "Use the number shown on the completion page."}</span>
            </button>
          </div>

          {lookupMode === "identity" ? (
            <>
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
            </>
          ) : lookupMode === "phone" ? (
            <section className="site-lookup-phone-form" aria-label={locale === "ko" ? "휴대전화 SMS 인증 조회" : "Phone SMS verification lookup"}>
              <div className="site-form-grid site-lookup-form-grid">
                <Input
                  label={t("lookup.name")}
                  value={form.name}
                  onChange={setField("name")}
                  placeholder={t("lookup.namePlaceholder")}
                />
                <div className="site-lookup-field-action">
                  <Input
                    className="site-lookup-field-action__input"
                    label={locale === "ko" ? "휴대전화" : "Phone"}
                    value={form.phone}
                    onChange={setField("phone")}
                    placeholder="010-0000-0000"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <Button
                    className="site-lookup-field-action__button"
                    onClick={handleSendPhoneVerificationCode}
                    disabled={isSendingCode}
                  >
                    {isSendingCode
                      ? (locale === "ko" ? "SMS 전송 중" : "Sending SMS")
                      : (locale === "ko" ? "SMS 인증번호 전송" : "Send SMS code")}
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
                      {locale === "ko" ? "SMS로 받은 6자리 인증번호를 입력해 주세요." : "Enter the 6-digit code sent by SMS."}
                    </span>
                  </label>
                  <Button
                    className="site-lookup-field-action__button"
                    onClick={handleVerifyPhoneCode}
                    disabled={isVerifyingCode}
                  >
                    {isVerifyingCode
                      ? (locale === "ko" ? "SMS 인증 중" : "Verifying SMS")
                      : (locale === "ko" ? "SMS 인증 확인" : "Verify SMS code")}
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
                    </div>
                  ) : null}
                </div>

                <p className="site-field__hint site-lookup-phone-form__hint">
                  {locale === "ko"
                    ? "SMS 인증 후 신청·결제 내역과 환불 가능 정보를 조회할 수 있습니다. 환불 요청 시 인증은 즉시 사용 처리됩니다."
                    : "SMS verification lets you view applications, payments, and refund availability. The verification is consumed when a refund is requested."}
                </p>
                <div className="site-lookup-actions">
                  <Button onClick={handlePhoneLookup} disabled={isSubmitting}>
                    {isSubmitting
                      ? (locale === "ko" ? "조회 중" : "Looking up")
                      : (locale === "ko" ? "SMS 인증으로 조회하기" : "Look up with SMS")}
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <section className="site-lookup-number-form" aria-label={locale === "ko" ? "신청번호 조회" : "Application number lookup"}>
              <Input
                label={locale === "ko" ? "신청번호" : "Application number"}
                value={form.applicationNumber}
                onChange={setField("applicationNumber")}
                placeholder="APPL-2026-XXXXXXXX"
                autoCapitalize="characters"
              />
              <p className="site-field__hint">
                {locale === "ko"
                  ? "대회 신청(APPL), 무대 서비스(SS), 참관객 신청(SPCT) 완료 화면에 표시된 신청번호를 입력해 주세요. 환불은 본인 확인을 위해 이름·이메일 인증 조회에서 진행합니다."
                  : "Enter the APPL, SS, or SPCT number shown on the completion page. Refunds require name and email verification."}
              </p>
              <div className="site-lookup-actions">
                <Button onClick={handleNumberLookup} disabled={isSubmitting}>
                  {isSubmitting ? (locale === "ko" ? "조회 중" : "Looking up") : (locale === "ko" ? "신청번호로 조회" : "Look up by number")}
                </Button>
              </div>
            </section>
          )}

          <NoticeBox title={t("lookup.noticeTitle")}>
            {lookupMode === "number" ? (
              <ul className="site-list">
                <li>{locale === "ko" ? "신청번호는 완료 화면에서 확인할 수 있으며, 타인에게 공유하지 않는 것이 좋습니다." : "Your application number is shown on the completion page and should not be shared."}</li>
                <li>{locale === "ko" ? "신청번호 조회에서는 결제 및 신청 상태만 확인할 수 있습니다." : "Application number lookup shows payment and application status only."}</li>
                <li>{locale === "ko" ? "환불 신청은 본인 확인을 위해 이름과 이메일 인증 조회에서 진행해 주세요." : "Use name and email verification to request a refund."}</li>
              </ul>
            ) : lookupMode === "phone" ? (
              <ul className="site-list">
                <li>{locale === "ko" ? "성함과 휴대전화가 신청 정보와 일치하는 경우에만 SMS 인증번호가 전송됩니다." : "An SMS code is sent only when your name and phone match an application."}</li>
                <li>{locale === "ko" ? "SMS 인증 조회에서도 환불 가능 정보와 환불 신청 버튼을 확인할 수 있습니다." : "SMS lookup also shows refund availability and refund actions."}</li>
                <li>{locale === "ko" ? "환불 요청을 완료하면 해당 SMS 인증은 즉시 사용 처리됩니다." : "The SMS verification is consumed immediately after a refund request."}</li>
              </ul>
            ) : (
              <ul className="site-list">
                <li>{t("lookup.notice1")}</li>
                <li>{t("lookup.notice2")}</li>
                <li>{t("lookup.notice3")}</li>
              </ul>
            )}
            <Link className="site-notice__link" to="/apply/guide">
              {t("common.viewApplyGuide")}
            </Link>
          </NoticeBox>

          {numberLookupResult ? (
            <div className="site-result-card site-number-lookup-result">
              <h3>{locale === "ko" ? "신청번호 조회 결과" : "Application number result"}</h3>
              <div className="site-lookup-result">
                <div className="site-review-row"><span>{locale === "ko" ? "신청 구분" : "Application type"}</span><strong>{numberLookupResult.type === "application" ? (locale === "ko" ? "대회 신청" : "Competition application") : numberLookupResult.type === "stageService" ? (locale === "ko" ? "무대 서비스" : "Stage service") : (locale === "ko" ? "참관객 신청" : "Spectator application")}</strong></div>
                <div className="site-review-row"><span>{locale === "ko" ? "신청번호" : "Application number"}</span><strong>{numberLookupResult.applicationNumber || numberLookupResult.serviceOrderNumber || numberLookupResult.spectatorOrderNumber}</strong></div>
                {numberLookupResult.type === "application" ? <><div className="site-review-row"><span>{locale === "ko" ? "신청 종목" : "Discipline"}</span><strong>{numberLookupResult.discipline || "-"}</strong></div><div className="site-review-row"><span>{locale === "ko" ? "체급" : "Weight class"}</span><strong>{numberLookupResult.weightClass || "-"}</strong></div></> : null}
                {numberLookupResult.type === "stageService" ? <><div className="site-review-row"><span>{locale === "ko" ? "서비스" : "Service"}</span><strong>{stageServiceTitles[numberLookupResult.serviceType] || numberLookupResult.serviceType}</strong></div><div className="site-review-row"><span>{locale === "ko" ? "연결 종목" : "Linked disciplines"}</span><strong>{numberLookupResult.linkedDisciplines?.join(", ") || "-"}</strong></div></> : null}
                {numberLookupResult.type === "spectator" ? <><div className="site-review-row"><span>{locale === "ko" ? "입장권" : "Ticket"}</span><strong>{numberLookupResult.quantity || 1}{locale === "ko" ? "매" : " ticket"}</strong></div><div className="site-review-row"><span>{locale === "ko" ? "입장 상태" : "Admission status"}</span><strong>{numberLookupResult.admissionStatus || "-"}</strong></div></> : null}
                <div className="site-review-row"><span>{t("lookup.paymentStatus")}</span><strong>{numberLookupResult.paymentStatus || "-"}</strong></div>
                <div className="site-review-row"><span>{locale === "ko" ? "결제 금액" : "Payment amount"}</span><strong>{formatAmount(numberLookupResult.paymentAmount ?? numberLookupResult.totalAmount, locale)}</strong></div>
                <div className="site-review-row"><span>{locale === "ko" ? "결제 완료 시점" : "Payment completed at"}</span><strong>{formatPaymentCompletedAt(numberLookupResult.paymentCompletedAt || numberLookupResult.purchasedAt, locale)}</strong></div>
              </div>
              <p className="site-field__hint">{locale === "ko" ? "신청번호 조회는 결제·신청 정보 확인용입니다. 환불 신청은 이름과 이메일 인증 조회 후 진행해 주세요." : "Application number lookup is read-only. Use name and email verification to request a refund."}</p>
            </div>
          ) : null}

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
                                getRefundRequestPath("application", result.applicationNumber)
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
                                {getStageServiceLinkedDisciplines(purchase)
                                  ? ` · ${getStageServiceLinkedDisciplines(purchase)}`
                                  : ""}
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
                                        getRefundRequestPath("stage-service", purchase.serviceOrderNumber)
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
                      {!isPhoneLookup && result.stageServiceSummary &&
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
                                  <Button disabled={!canRequestRefund} onClick={() => navigate(getRefundRequestPath("spectator", spectator.spectatorOrderNumber))}>환불 신청</Button>
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
