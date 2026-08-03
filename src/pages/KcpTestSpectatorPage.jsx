import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cancelKcpTestSpectatorOrder,
  completeSpectatorOrder,
  createKcpTestSpectatorDraft,
  createKcpTestSpectatorOrder,
  prepareKcpPayment,
} from "../lib/applicationApi";

const testAmount = 100;

const initialForm = {
  name: "KCP 테스트",
  phone: "",
  email: "",
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
    return "이메일 형식을 확인해 주세요.";
  }

  return "";
}

function submitKcpPayment(payUrl, formFields) {
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

export function KcpTestSpectatorPage() {
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token") || window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [form, setForm] = useState(initialForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const draftResult = await createKcpTestSpectatorDraft({ ...form, token });
      const draftId = draftResult.draft.draftId;
      const orderResult = await createKcpTestSpectatorOrder({ draftId, token });
      const paymentResult = await prepareKcpPayment({
        context: "spectatorTest",
        draftId,
        orderId: orderResult.order.orderId,
        paymentMethod: "CARD",
        token,
      });

      window.sessionStorage.setItem("kcpTestPaymentToken", token);
      submitKcpPayment(paymentResult.payUrl, paymentResult.formFields);
    } catch (error) {
      setErrorMessage(error.message || "KCP 참관객 테스트 결제를 준비하지 못했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 운영 결제 테스트</p>
        <h1>참관객 입장권 100원 카드 결제</h1>
        <p className="kcp-test-description">
          참관객 입장권 신청과 같은 성함, 연락처, 이메일 입력 흐름을 검증합니다. 테스트 주문은
          실판매 수량과 중복 구매 제한에 포함되지 않습니다.
        </p>

        <div className="kcp-test-summary">
          <span>테스트 결제금액</span>
          <strong>{formatAmount(testAmount)}</strong>
        </div>

        <form className="kcp-test-form" onSubmit={handleSubmit}>
          <div className="kcp-test-form-grid">
            <label className="kcp-test-field">
              성함 <em>(필수)</em>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                maxLength={120}
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
            <label className="kcp-test-field kcp-test-field--full">
              이메일 <em>(필수)</em>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={255}
                autoComplete="email"
              />
            </label>
          </div>

          {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
          <button className="button kcp-test-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "테스트 주문 생성 및 결제창 여는 중" : "참관객 입장권 100원 테스트 결제"}
          </button>
        </form>

        <Link
          className="button kcp-test-button kcp-test-link"
          to={`/kcp-test${token ? `?token=${encodeURIComponent(token)}` : ""}`}
        >
          일반 대회 신청 테스트로 이동
        </Link>
      </section>
    </main>
  );
}

export function KcpTestSpectatorSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const draftId = searchParams.get("draftId");
  const confirmed = searchParams.get("confirmed");
  const token = window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [isCompleting, setIsCompleting] = useState(Boolean(orderId && draftId));
  const [spectatorOrderNumber, setSpectatorOrderNumber] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationResult, setCancellationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!orderId || !draftId || confirmed !== "1") {
      setIsCompleting(false);
      setErrorMessage("결제 승인 또는 참관객 신청 정보를 확인할 수 없습니다.");
      return undefined;
    }

    let isActive = true;
    completeSpectatorOrder({ draftId, orderId })
      .then((result) => {
        if (isActive) setSpectatorOrderNumber(result.spectatorOrder?.spectatorOrderNumber || "");
      })
      .catch((error) => {
        if (isActive) setErrorMessage(error.message || "테스트 참관객 주문을 완료하지 못했습니다.");
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
      setCancellationResult(await cancelKcpTestSpectatorOrder(orderId, { token }));
    } catch (error) {
      setErrorMessage(error.message || "KCP 테스트 결제를 취소하지 못했습니다.");
    } finally {
      setIsCancelling(false);
    }
  }

  const rows = [
    ["주문번호", orderId],
    ["참관객 신청번호", spectatorOrderNumber || (isCompleting ? "신청 생성 중" : "-")],
    ["결제금액", formatAmount(searchParams.get("amount"))],
    ["KCP 거래번호", searchParams.get("paymentKey")],
  ];

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>참관객 입장권 결제 승인 완료</h1>
        <p className="kcp-test-description">
          테스트 주문은 관리자 참관객 관리에서 확인할 수 있으며, 실판매 집계에는 포함되지 않습니다.
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
            100원 결제가 취소되었고 테스트 참관객 주문의 결제 상태도 CANCELED로 변경되었습니다.
          </p>
        ) : null}
        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
        <button
          className="button kcp-test-button"
          type="button"
          onClick={cancelTestPayment}
          disabled={isCompleting || isCancelling || Boolean(cancellationResult)}
        >
          {isCancelling ? "결제 취소 중" : cancellationResult ? "100원 결제 취소 완료" : "100원 결제 취소"}
        </button>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test/spectators">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}

export function KcpTestSpectatorFailPage() {
  const [searchParams] = useSearchParams();

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>참관객 입장권 결제 실패</h1>
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
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test/spectators">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}
