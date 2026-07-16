import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cancelKcpTestOrder,
  completeApplication,
  createDraft,
  createKcpTestOrder,
  prepareKcpPayment,
  uploadFile,
} from "../lib/applicationApi";
import uploadIcon from "../assets/upload-icon.png";
import { getWeightClassOptions } from "../data/applicationWeightClassOptions";
import {
  getSnsPlatformOptions,
  serializeDetailedSnsIdentity,
} from "../lib/applicationSns";

const testAmount = 100;
const maxUploadBytes = 10 * 1024 * 1024;
const allowedDocumentUploadExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
]);
const allowedDocumentUploadMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);
const documentFileInputAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png";

const testDisciplineOptions = [
  { imageKey: "register/man_1.png", title: "Bodybuilding" },
  { imageKey: "register/man_2.png", title: "Classic Physique" },
  { imageKey: "register/man_3.png", title: "Physique" },
  { imageKey: "register/common_1.png", title: "Model" },
  { imageKey: "register/common_2.png", title: "Fitness" },
  { imageKey: "register/common_3.png", title: "Denim" },
  { imageKey: "register/common_4.png", title: "Transformation" },
  { imageKey: "register/woman_1.png", title: "Ms.Bikini" },
  { imageKey: "register/woman_2.png", title: "Figure" },
];

const initialForm = {
  name: "KCP 테스트",
  phone: "",
  email: "",
  birthDate: "",
  organization: "",
  snsPlatform: "",
  snsOtherPlatform: "",
  snsId: "",
  introduction: "",
  imageKey: testDisciplineOptions[0].imageKey,
  weightClass: "",
};

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

function validateTestForm(form, weightClassOptions) {
  if (!form.name.trim()) {
    return "성함을 입력해 주세요.";
  }

  if (form.phone.replace(/\D/g, "").length !== 11) {
    return "연락처를 11자리로 입력해 주세요.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "올바른 이메일 주소를 입력해 주세요.";
  }

  if (!form.birthDate) {
    return "생년월일을 입력해 주세요.";
  }

  if (weightClassOptions.length > 0 && !form.weightClass) {
    return "체급을 선택해 주세요.";
  }

  if (form.introduction.trim().length > 100) {
    return "자기 소개 멘트는 100자 이내로 입력해 주세요.";
  }

  if (form.snsPlatform === "other" && !form.snsOtherPlatform.trim()) {
    return "기타 SNS 종류를 입력해 주세요.";
  }

  return "";
}

function getUploadExtension(filename) {
  const match = String(filename || "").match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function validateTestUpload(file) {
  if (!file) {
    return "";
  }

  if (
    !allowedDocumentUploadExtensions.has(getUploadExtension(file.name)) ||
    !allowedDocumentUploadMimeTypes.has(file.type)
  ) {
    return "첨부 파일 형식이 허용되지 않습니다.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "비어 있는 파일은 업로드할 수 없습니다.";
  }

  if (file.size > maxUploadBytes) {
    return "파일 크기는 최대 10MB까지 업로드할 수 있습니다.";
  }

  return "";
}

export function KcpTestPaymentPage() {
  const [searchParams] = useSearchParams();
  const documentFileInputRef = useRef(null);
  const token =
    searchParams.get("token") ||
    window.sessionStorage.getItem("kcpTestPaymentToken") ||
    "";
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const selectedDiscipline = useMemo(
    () =>
      testDisciplineOptions.find((option) => option.imageKey === form.imageKey) ||
      testDisciplineOptions[0],
    [form.imageKey],
  );
  const weightClassOptions = useMemo(
    () => getWeightClassOptions(selectedDiscipline.imageKey),
    [selectedDiscipline.imageKey],
  );
  const snsPlatformOptions = useMemo(() => getSnsPlatformOptions("ko"), []);

  useEffect(() => {
    if (!weightClassOptions.includes(form.weightClass)) {
      setForm((current) => ({ ...current, weightClass: "" }));
    }
  }, [form.weightClass, weightClassOptions]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: field === "phone" ? formatPhoneNumber(value) : value,
    }));
  }

  function handleDocumentFileChange(event) {
    const file = event.target.files?.[0] || null;
    const validationMessage = validateTestUpload(file);

    if (validationMessage) {
      event.target.value = "";
      setErrorMessage(validationMessage);
      setDocumentFile(null);
      return;
    }

    setErrorMessage("");
    setDocumentFile(file);
  }

  async function requestKcpTestPayment(event) {
    event.preventDefault();
    setErrorMessage("");

    const validationMessage = validateTestForm(form, weightClassOptions);

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    const documentValidationMessage = validateTestUpload(documentFile);

    if (documentValidationMessage) {
      setErrorMessage(documentValidationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const serializedSnsIdentity = serializeDetailedSnsIdentity({
        platform: form.snsPlatform,
        customPlatform: form.snsOtherPlatform,
        id: form.snsId,
      });
      const draftResult = await createDraft({
        name: form.name,
        phone: form.phone,
        email: form.email,
        birthDate: form.birthDate,
        organization: form.organization,
        instagramId: serializedSnsIdentity,
        introduction: form.introduction,
        weightClass: form.weightClass,
        paymentMethod: "payment",
        selection: {
          division: "TEST",
          discipline: selectedDiscipline.title,
          imageKey: selectedDiscipline.imageKey,
        },
        consents: {
          privacy: true,
          terms: true,
          refund: true,
          marketing: false,
          photoVideo: false,
          version: "kcp-test-v1",
        },
      });
      const draftId = draftResult.draft.draftId;

      if (documentFile) {
        await uploadFile({
          draftId,
          file: documentFile,
        });
      }

      const orderResult = await createKcpTestOrder({
        customerName: form.name,
        customerEmail: form.email,
        draftId,
        token,
      });
      const paymentResult = await prepareKcpPayment({
        context: "kcpTest",
        draftId,
        orderId: orderResult.order.orderId,
        paymentMethod: "CARD",
        token,
      });

      window.sessionStorage.setItem("kcpTestPaymentToken", token);
      submitKcpPayment(paymentResult.payUrl, paymentResult.formFields);
    } catch (error) {
      setErrorMessage(error.message || "KCP 테스트 결제를 준비하지 못했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel kcp-test-panel--wide">
        <p className="kcp-test-eyebrow">KCP 운영 결제 테스트</p>
        <h1>신청 정보 입력 및 100원 카드 결제</h1>
        <p className="kcp-test-description">
          결제 승인 후 입력한 정보는 테스트 신청 데이터로 저장됩니다. 관리자 등록 현황에서
          참가 구분이 <strong>TEST</strong>인 항목으로 확인할 수 있습니다.
        </p>

        <div className="kcp-test-summary">
          <span>테스트 결제금액</span>
          <strong>{testAmount.toLocaleString("ko-KR")}원</strong>
        </div>

        <form className="kcp-test-form" onSubmit={requestKcpTestPayment}>
          <div className="kcp-test-form-grid">
            <label className="kcp-test-field">
              성함 <em>(필수)</em>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                maxLength={40}
                autoComplete="name"
              />
            </label>

            <label className="kcp-test-field">
              연락처 <em>(필수)</em>
              <input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                inputMode="numeric"
                placeholder="010-0000-0000"
                autoComplete="tel"
              />
            </label>

            <label className="kcp-test-field">
              이메일 <em>(필수)</em>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={120}
                autoComplete="email"
              />
            </label>

            <label className="kcp-test-field">
              생년월일 <em>(필수)</em>
              <input
                type="date"
                value={form.birthDate}
                onChange={(event) => updateField("birthDate", event.target.value)}
              />
            </label>

            <label className="kcp-test-field">
              테스트 종목 <em>(필수)</em>
              <select
                value={form.imageKey}
                onChange={(event) => updateField("imageKey", event.target.value)}
              >
                {testDisciplineOptions.map((option) => (
                  <option key={option.imageKey} value={option.imageKey}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>

            {weightClassOptions.length > 0 ? (
              <label className="kcp-test-field">
                체급 <em>(필수)</em>
                <select
                  value={form.weightClass}
                  onChange={(event) => updateField("weightClass", event.target.value)}
                >
                  <option value="">체급을 선택해 주세요</option>
                  {weightClassOptions.map((weightClass) => (
                    <option key={weightClass} value={weightClass}>
                      {weightClass}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="kcp-test-field">
              소속 <em>(선택)</em>
              <input
                value={form.organization}
                onChange={(event) => updateField("organization", event.target.value)}
                maxLength={120}
              />
            </label>

            <label className="kcp-test-field">
              SNS 플랫폼 <em>(선택)</em>
              <select
                value={form.snsPlatform}
                onChange={(event) => updateField("snsPlatform", event.target.value)}
              >
                <option value="">플랫폼을 선택해 주세요</option>
                {snsPlatformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {form.snsPlatform === "other" ? (
              <label className="kcp-test-field">
                기타 SNS 종류 <em>(필수)</em>
                <input
                  value={form.snsOtherPlatform}
                  onChange={(event) => updateField("snsOtherPlatform", event.target.value)}
                  maxLength={40}
                />
              </label>
            ) : null}

            {form.snsPlatform && form.snsPlatform !== "none" ? (
              <label className="kcp-test-field">
                SNS ID <em>(선택)</em>
                <input
                  value={form.snsId}
                  onChange={(event) => updateField("snsId", event.target.value)}
                  maxLength={120}
                />
              </label>
            ) : null}

            <label className="kcp-test-field kcp-test-field--full">
              자기 소개 멘트 <em>(선택, 최대 100자)</em>
              <textarea
                value={form.introduction}
                onChange={(event) => updateField("introduction", event.target.value)}
                maxLength={100}
                rows={4}
              />
              <span className="kcp-test-field__count">{form.introduction.length}/100</span>
            </label>

            <label className="kcp-test-field">
              첨부 파일 <em>(선택)</em>
              <div className="site-file-picker">
                <input
                  className="site-file-picker__input"
                  ref={documentFileInputRef}
                  type="file"
                  accept={documentFileInputAccept}
                  onChange={handleDocumentFileChange}
                />
                <span
                  className={`site-file-picker__value ${
                    documentFile ? "" : "site-file-picker__value--placeholder"
                  }`.trim()}
                >
                  {documentFile?.name || "선택된 파일 없음"}
                </span>
                <button
                  className="site-file-picker__trigger"
                  type="button"
                  onClick={() => documentFileInputRef.current?.click()}
                  aria-label="첨부 파일 선택"
                >
                  <img className="site-file-picker__trigger-icon" src={uploadIcon} alt="" />
                </button>
              </div>
              <span className="kcp-test-field__hint">
                PDF, Word, PowerPoint, JPG, PNG 파일만 가능하며 최대 10MB입니다.
              </span>
            </label>

          </div>

          {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}

          <button className="button kcp-test-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "신청 데이터 저장 및 결제창 여는 중" : "100원 테스트 결제"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function KcpTestPaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const draftId = searchParams.get("draftId");
  const confirmed = searchParams.get("confirmed");
  const amount = searchParams.get("amount");
  const paymentKey = searchParams.get("paymentKey");
  const provider = searchParams.get("provider");
  const token = window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [isCompleting, setIsCompleting] = useState(Boolean(orderId && draftId));
  const [applicationNumber, setApplicationNumber] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationResult, setCancellationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!orderId || !draftId || confirmed !== "1") {
      setIsCompleting(false);
      setErrorMessage("결제 승인 또는 신청서 정보를 확인할 수 없습니다.");
      return;
    }

    let isActive = true;

    async function completeTestApplication() {
      try {
        const result = await completeApplication({ draftId, orderId });

        if (isActive) {
          setApplicationNumber(result.application?.applicationNumber || "");
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error.message || "테스트 신청 데이터를 완료하지 못했습니다.");
        }
      } finally {
        if (isActive) {
          setIsCompleting(false);
        }
      }
    }

    completeTestApplication();

    return () => {
      isActive = false;
    };
  }, [confirmed, draftId, orderId]);

  const rows = useMemo(
    () => [
      ["주문번호", orderId],
      ["테스트 신청번호", applicationNumber || (isCompleting ? "신청 데이터 생성 중" : "-")],
      ["결제금액", formatAmount(amount)],
      ["KCP 거래번호", paymentKey],
      ["결제대행사", provider],
    ],
    [amount, applicationNumber, isCompleting, orderId, paymentKey, provider],
  );

  async function cancelTestPayment() {
    if (!orderId) {
      setErrorMessage("주문번호를 확인할 수 없습니다.");
      return;
    }

    setIsCancelling(true);
    setErrorMessage("");

    try {
      const result = await cancelKcpTestOrder(orderId, { token });
      setCancellationResult(result);
    } catch (error) {
      setErrorMessage(error.message || "KCP 테스트 결제를 취소하지 못했습니다.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>결제 승인 완료</h1>
        <p className="kcp-test-description">
          결제 승인 후 테스트 신청서가 생성됩니다. 관리자 등록 현황에서 참가 구분이 TEST인
          데이터와 결제 상태를 확인하세요.
        </p>
        <div className="kcp-test-result">
          {rows.map(([label, value]) => (
            <div className="kcp-test-result-row" key={label}>
              <span>{label}</span>
              <strong>{value || "-"}</strong>
            </div>
          ))}
        </div>
        {cancellationResult ? (
          <p className="kcp-test-success">
            100원 결제가 취소되었고 테스트 신청 데이터도 CANCELED 상태로 변경되었습니다.
          </p>
        ) : null}
        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
        <button
          className="button kcp-test-button"
          type="button"
          onClick={cancelTestPayment}
          disabled={isCompleting || isCancelling || Boolean(cancellationResult)}
        >
          {isCancelling
            ? "결제 취소 중"
            : cancellationResult
              ? "100원 결제 취소 완료"
              : "100원 결제 취소"}
        </button>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}

export function KcpTestPaymentFailPage() {
  const [searchParams] = useSearchParams();

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>결제 실패</h1>
        <div className="kcp-test-result">
          <div className="kcp-test-result-row">
            <span>오류 코드</span>
            <strong>{searchParams.get("code") || "-"}</strong>
          </div>
          <div className="kcp-test-result-row">
            <span>오류 메시지</span>
            <strong>{searchParams.get("message") || "-"}</strong>
          </div>
        </div>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}

function submitKcpPayment(payUrl, formFields = {}) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = payUrl;

  Object.entries(formFields).forEach(([name, value]) => {
    if (value == null) {
      return;
    }

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function formatAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return value;
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}
