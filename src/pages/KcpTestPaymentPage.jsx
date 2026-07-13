import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cancelKcpTestOrder,
  createKcpTestOrder,
  prepareKcpPayment,
} from "../lib/applicationApi";

const testAmount = 100;

export function KcpTestPaymentPage() {
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token") ||
    window.sessionStorage.getItem("kcpTestPaymentToken") ||
    "";
  const [customerName, setCustomerName] = useState("KCP 테스트");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function requestKcpTestPayment() {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const orderResult = await createKcpTestOrder({
        customerName,
        customerEmail,
        token,
      });
      const paymentResult = await prepareKcpPayment({
        context: "kcpTest",
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
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 운영 결제 테스트</p>
        <h1>100원 카드 결제</h1>
        <p className="kcp-test-description">
          이 페이지는 KCP 결제 승인 흐름만 확인합니다. 결제가 성공해도 대회 신청서나 무대 서비스 주문은 생성하지 않습니다.
        </p>

        <div className="kcp-test-summary">
          <span>결제금액</span>
          <strong>{testAmount.toLocaleString("ko-KR")}원</strong>
        </div>

        <label className="kcp-test-field">
          이름
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={40}
          />
        </label>

        <label className="kcp-test-field">
          이메일
          <input
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            maxLength={120}
            placeholder="선택 입력"
          />
        </label>

        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}

        <button
          className="button kcp-test-button"
          type="button"
          onClick={requestKcpTestPayment}
          disabled={isSubmitting}
        >
          {isSubmitting ? "결제창 여는 중" : "100원 결제 테스트"}
        </button>
      </section>
    </main>
  );
}

export function KcpTestPaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const token = window.sessionStorage.getItem("kcpTestPaymentToken") || "";
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationResult, setCancellationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const rows = useMemo(
    () => [
      ["주문번호", orderId],
      ["결제금액", formatAmount(searchParams.get("amount"))],
      ["KCP 거래번호", searchParams.get("paymentKey")],
      ["결제대행사", searchParams.get("provider")],
    ],
    [orderId, searchParams]
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
          DB에서 승인 상태를 확인한 뒤 아래 버튼으로 KCP 전체취소와 DB 상태 동기화를 테스트하세요.
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
          <p className="kcp-test-success">100원 결제가 취소되었고 DB 상태도 CANCELED로 변경되었습니다.</p>
        ) : null}
        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}
        <button
          className="button kcp-test-button"
          type="button"
          onClick={cancelTestPayment}
          disabled={isCancelling || Boolean(cancellationResult)}
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
