import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import stageServiceConfig from "../data/stageServiceConfig.json";
import {
  cancelKcpTestStageServiceOrder,
  completeStageService,
  createKcpTestStageServiceDraft,
  createKcpTestStageServiceOrder,
  prepareKcpPayment,
} from "../lib/applicationApi";

const testAmount = 100;
const services = stageServiceConfig.services || {};
const disciplineOptions = stageServiceConfig.disciplineOptions || [];

const initialForm = {
  name: "KCP 테스트",
  phone: "",
  email: "",
  serviceType: "stage-photo",
  photoHasAdditionalDiscipline: "X",
  photoAdditionalDiscipline: "",
  videoType: "",
  videoAdditionalDiscipline: "",
  hairParticipantDiscipline: "",
  hairOption: "",
  hairAdditionalDiscipline: "",
  hairOptionalOption: "",
};

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatAmount(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function validateForm(form) {
  if (!form.name.trim()) return "성함을 입력해 주세요.";
  if (form.phone.replace(/\D/g, "").length !== 11) return "연락처를 11자리로 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "올바른 이메일 주소를 입력해 주세요.";
  }

  if (form.serviceType === "stage-photo") {
    if (form.photoHasAdditionalDiscipline === "O" && !form.photoAdditionalDiscipline) {
      return "추가 종목을 선택해 주세요.";
    }
  }

  if (form.serviceType === "stage-video" && !form.videoType) {
    return "영상 타입을 선택해 주세요.";
  }

  if (form.serviceType === "hair-makeup") {
    if (!form.hairParticipantDiscipline) return "참가 종목을 선택해 주세요.";
    if (!form.hairOption) return "헤어&메이크업 옵션을 선택해 주세요.";
    if (
      form.hairAdditionalDiscipline &&
      form.hairAdditionalDiscipline === form.hairParticipantDiscipline
    ) {
      return "추가 종목은 참가 종목과 다르게 선택해 주세요.";
    }
  }

  return "";
}

function submitKcpPayment(payUrl, formFields = {}) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = payUrl;

  Object.entries(formFields).forEach(([name, value]) => {
    if (value == null) return;

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

export function KcpTestStageServicePage() {
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token") || window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [form, setForm] = useState(initialForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const service = services[form.serviceType] || services["stage-photo"];
  const hairOptions = services["hair-makeup"]?.hairOptions || [];
  const selectedHairOption = hairOptions.find((option) => option.value === form.hairOption);
  const hairOptionalOptions = useMemo(
    () =>
      (services["hair-makeup"]?.optionalOptions || []).filter((option) => {
        if (option.requiresAdditionalDiscipline && !form.hairAdditionalDiscipline) return false;
        return option.gender === "all" || option.gender === selectedHairOption?.gender;
      }),
    [form.hairAdditionalDiscipline, selectedHairOption?.gender],
  );
  const videoAdditionalOptions = useMemo(
    () =>
      (services["stage-video"]?.videoTypes || []).flatMap((videoType) =>
        disciplineOptions.map((discipline) => ({
          value: `${videoType.value}::${discipline}`,
          label: `${videoType.label}: ${discipline} (${formatAmount(videoType.price)})`,
        })),
      ),
    [],
  );

  useEffect(() => {
    if (form.photoHasAdditionalDiscipline === "X" && form.photoAdditionalDiscipline) {
      setForm((current) => ({ ...current, photoAdditionalDiscipline: "" }));
    }
  }, [form.photoAdditionalDiscipline, form.photoHasAdditionalDiscipline]);

  useEffect(() => {
    if (
      form.hairOptionalOption &&
      !hairOptionalOptions.some((option) => option.value === form.hairOptionalOption)
    ) {
      setForm((current) => ({ ...current, hairOptionalOption: "" }));
    }
  }, [form.hairOptionalOption, hairOptionalOptions]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: field === "phone" ? formatPhoneNumber(value) : value,
    }));
    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationMessage = validateForm(form);

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const draftResult = await createKcpTestStageServiceDraft({
        ...form,
        paymentMethod: "payment",
        token,
      });
      const draftId = draftResult.draft.draftId;
      const orderResult = await createKcpTestStageServiceOrder({ draftId, token });
      const paymentResult = await prepareKcpPayment({
        context: "stageServiceTest",
        draftId,
        orderId: orderResult.order.orderId,
        paymentMethod: "CARD",
        token,
      });

      window.sessionStorage.setItem("kcpTestPaymentToken", token);
      submitKcpPayment(paymentResult.payUrl, paymentResult.formFields);
    } catch (error) {
      setErrorMessage(error.message || "KCP 무대 서비스 테스트 결제를 준비하지 못했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel kcp-test-panel--wide">
        <p className="kcp-test-eyebrow">KCP 운영 결제 테스트</p>
        <h1>무대 서비스 100원 카드 결제</h1>
        <p className="kcp-test-description">
          먼저 일반 <strong>KCP 테스트 대회 신청</strong>을 완료한 뒤, 동일한 성함·연락처·이메일로
          진행해 주세요. 무대 서비스 옵션은 저장되지만 결제 주문 금액은 테스트용으로 100원입니다.
        </p>

        <div className="kcp-test-summary">
          <span>테스트 결제금액</span>
          <strong>{formatAmount(testAmount)}</strong>
        </div>

        <form className="kcp-test-form" onSubmit={handleSubmit}>
          <div className="kcp-test-form-grid">
            <label className="kcp-test-field">
              성함 <em>(필수)</em>
              <input value={form.name} onChange={(event) => updateField("name", event.target.value)} maxLength={120} autoComplete="name" />
            </label>
            <label className="kcp-test-field">
              연락처 <em>(필수)</em>
              <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} inputMode="numeric" placeholder="010-0000-0000" autoComplete="tel" />
            </label>
            <label className="kcp-test-field">
              이메일 <em>(필수)</em>
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} maxLength={255} autoComplete="email" />
            </label>
            <label className="kcp-test-field">
              무대 서비스 <em>(필수)</em>
              <select value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)}>
                {Object.entries(services).map(([value, item]) => (
                  <option key={value} value={value}>{item.title}</option>
                ))}
              </select>
            </label>

            {form.serviceType === "stage-photo" ? <>
              <label className="kcp-test-field">
                종목 추가 여부 <em>(필수)</em>
                <select value={form.photoHasAdditionalDiscipline} onChange={(event) => updateField("photoHasAdditionalDiscipline", event.target.value)}>
                  <option value="X">X</option>
                  <option value="O">O</option>
                </select>
              </label>
              <label className="kcp-test-field">
                추가 종목 <em>(선택)</em>
                <select value={form.photoAdditionalDiscipline} onChange={(event) => updateField("photoAdditionalDiscipline", event.target.value)} disabled={form.photoHasAdditionalDiscipline !== "O"}>
                  <option value="">추가 종목을 선택해 주세요</option>
                  {disciplineOptions.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
                </select>
              </label>
            </> : null}

            {form.serviceType === "stage-video" ? <>
              <label className="kcp-test-field">
                영상 타입 <em>(필수)</em>
                <select value={form.videoType} onChange={(event) => updateField("videoType", event.target.value)}>
                  <option value="">영상 타입을 선택해 주세요</option>
                  {(service.videoTypes || []).map((option) => <option key={option.value} value={option.value}>{option.label} ({formatAmount(option.price)})</option>)}
                </select>
              </label>
              <label className="kcp-test-field">
                추가 영상 종목 <em>(선택)</em>
                <select value={form.videoAdditionalDiscipline} onChange={(event) => updateField("videoAdditionalDiscipline", event.target.value)}>
                  <option value="">추가 영상 종목을 선택해 주세요</option>
                  {videoAdditionalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </> : null}

            {form.serviceType === "hair-makeup" ? <>
              <label className="kcp-test-field">
                참가 종목 <em>(필수)</em>
                <select value={form.hairParticipantDiscipline} onChange={(event) => updateField("hairParticipantDiscipline", event.target.value)}>
                  <option value="">참가 종목을 선택해 주세요</option>
                  {disciplineOptions.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
                </select>
              </label>
              <label className="kcp-test-field">
                헤어&메이크업 <em>(필수)</em>
                <select value={form.hairOption} onChange={(event) => updateField("hairOption", event.target.value)}>
                  <option value="">옵션을 선택해 주세요</option>
                  {hairOptions.map((option) => <option key={option.value} value={option.value}>{option.label} ({formatAmount(option.price)})</option>)}
                </select>
              </label>
              <label className="kcp-test-field">
                추가 종목 <em>(선택)</em>
                <select value={form.hairAdditionalDiscipline} onChange={(event) => updateField("hairAdditionalDiscipline", event.target.value)}>
                  <option value="">추가 종목을 선택해 주세요</option>
                  {disciplineOptions.filter((discipline) => discipline !== form.hairParticipantDiscipline).map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
                </select>
              </label>
              <label className="kcp-test-field">
                추가 옵션 <em>(선택)</em>
                <select value={form.hairOptionalOption} onChange={(event) => updateField("hairOptionalOption", event.target.value)} disabled={!form.hairOption}>
                  <option value="">추가 옵션을 선택해 주세요</option>
                  {hairOptionalOptions.map((option) => <option key={option.value} value={option.value}>{option.label} ({formatAmount(option.price)})</option>)}
                </select>
              </label>
            </> : null}
          </div>

          {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
          <button className="button kcp-test-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "테스트 주문 생성 및 결제창 여는 중" : "무대 서비스 100원 테스트 결제"}
          </button>
        </form>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test">일반 대회 신청 테스트로 이동</Link>
      </section>
    </main>
  );
}

export function KcpTestStageServiceSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const draftId = searchParams.get("draftId");
  const confirmed = searchParams.get("confirmed");
  const token = window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [isCompleting, setIsCompleting] = useState(Boolean(orderId && draftId));
  const [serviceOrderNumber, setServiceOrderNumber] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationResult, setCancellationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!orderId || !draftId || confirmed !== "1") {
      setIsCompleting(false);
      setErrorMessage("결제 승인 또는 무대 서비스 정보를 확인할 수 없습니다.");
      return;
    }

    let isActive = true;
    completeStageService({ draftId, orderId })
      .then((result) => {
        if (isActive) setServiceOrderNumber(result.serviceOrder?.serviceOrderNumber || "");
      })
      .catch((error) => {
        if (isActive) setErrorMessage(error.message || "테스트 무대 서비스 데이터를 완료하지 못했습니다.");
      })
      .finally(() => {
        if (isActive) setIsCompleting(false);
      });

    return () => {
      isActive = false;
    };
  }, [confirmed, draftId, orderId]);

  async function cancelTestPayment() {
    if (!orderId) {
      setErrorMessage("주문번호를 확인할 수 없습니다.");
      return;
    }

    setIsCancelling(true);
    setErrorMessage("");
    try {
      setCancellationResult(await cancelKcpTestStageServiceOrder(orderId, { token }));
    } catch (error) {
      setErrorMessage(error.message || "KCP 테스트 결제를 취소하지 못했습니다.");
    } finally {
      setIsCancelling(false);
    }
  }

  const rows = [
    ["주문번호", orderId],
    ["무대 서비스 주문번호", serviceOrderNumber || (isCompleting ? "주문 생성 중" : "-")],
    ["결제금액", formatAmount(searchParams.get("amount"))],
    ["KCP 거래번호", searchParams.get("paymentKey")],
  ];

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>무대 서비스 결제 승인 완료</h1>
        <p className="kcp-test-description">관리자 무대 서비스 관리에서 TEST 대회 신청번호에 연결된 주문을 확인할 수 있습니다.</p>
        <div className="kcp-test-result">
          {rows.map(([label, value]) => <div className="kcp-test-result-row" key={label}><span>{label}</span><strong>{value || "-"}</strong></div>)}
        </div>
        {cancellationResult ? <p className="kcp-test-success">100원 결제가 취소되었고 무대 서비스 주문의 결제 상태도 CANCELED로 변경되었습니다.</p> : null}
        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
        <button className="button kcp-test-button" type="button" onClick={cancelTestPayment} disabled={isCompleting || isCancelling || Boolean(cancellationResult)}>
          {isCancelling ? "결제 취소 중" : cancellationResult ? "100원 결제 취소 완료" : "100원 결제 취소"}
        </button>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test/stage-services">다시 테스트</Link>
      </section>
    </main>
  );
}

export function KcpTestStageServiceFailPage() {
  const [searchParams] = useSearchParams();

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>무대 서비스 결제 실패</h1>
        <div className="kcp-test-result">
          <div className="kcp-test-result-row"><span>오류 코드</span><strong>{searchParams.get("code") || "-"}</strong></div>
          <div className="kcp-test-result-row"><span>오류 메시지</span><strong>{searchParams.get("message") || "-"}</strong></div>
        </div>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test/stage-services">다시 테스트</Link>
      </section>
    </main>
  );
}
